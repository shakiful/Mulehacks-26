import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "../api/mock";
import type { Understanding } from "../api/types";
import { ApiProvider } from "../context/ApiContext";
import { CreatePost } from "./CreatePost";
vi.mock("./RideRoutePicker", () => import("../test/MockRideRoutePicker"));
const locations = vi.hoisted(() => ({ resolve: vi.fn(), suggest: vi.fn(), reverse: vi.fn() }));
vi.mock('../lib/places', async (original) => ({ ...await original<typeof import('../lib/places')>(),
  resolveRidePlace: locations.resolve, suggestPlaces: locations.suggest, reversePlace: locations.reverse }));
beforeEach(() => { locations.resolve.mockReset(); locations.suggest.mockReset().mockResolvedValue([]); locations.reverse.mockReset().mockResolvedValue(null); });

const context = { reference_time: "2026-10-03T16:00:00-05:00", timezone: "America/Chicago" };
const study = (changes: Partial<Understanding> = {}): Understanding => ({
  category: "STUDY", intent: "REQUEST", title: "Help with SQL joins",
  text: "I need help studying SQL joins tonight", location: null, starts_at: null, ends_at: null,
  details: { course: "SQL", topic: "joins", skill_level: null, mode: null },
  missing_fields: [], warnings: [], analysis_mode: "LLM", ...changes,
});

function setup(preview = study()) {
  const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
  const understand = vi.fn(api.understand);
  const createPost = vi.fn(api.createPost);
  const onCreated = vi.fn();
  render(<ApiProvider client={{ ...api, understand, createPost }} mockMode={false}>
    <CreatePost preview={preview} previewContext={context} onCreated={onCreated} />
  </ApiProvider>);
  return { understand, createPost, onCreated, user: userEvent.setup() };
}

describe("conversational post clarification", () => {
  it('allows a manual name for an explicitly clicked map point when place lookup is unavailable', async () => {
    const { user, createPost } = setup(study({ category: 'RIDE', starts_at: '2026-10-03T18:00:00-05:00',
      details: { origin: 'Campus', destination: '', origin_point: { lat: 38.7625, lng: -93.7395 }, destination_point: null, seats: 1 } }));
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    await user.click(await screen.findByRole('button', { name: 'Select To awaiting name' }));
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'Walmart west entrance');
    await user.click(screen.getByRole('button', { name: 'Hide map' }));
    await user.click(screen.getByRole('button', { name: 'Confirm & post' }));
    await waitFor(() => expect(createPost).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      destination: 'Walmart west entrance', destination_point: { lat: 38.7905, lng: -93.739 },
    }) }));
  });
  it('selects both field suggestions, submits their points, and blocks a later unselected text edit', async () => {
    vi.stubEnv('VITE_MAPTILER_API_KEY', 'synthetic');
    const origin = { id: 'ucm', label: 'University of Central Missouri', point: { lat: 38.7625, lng: -93.7395 } };
    const destination = { id: 'store', label: 'Walmart Supercenter', point: { lat: 38.7905, lng: -93.739 } };
    locations.suggest.mockImplementation(async (query: string) => [query === 'UCM' ? origin : destination]);
    const { user, createPost } = setup(study({ category: 'RIDE', starts_at: '2026-10-03T18:00:00-05:00',
      details: { origin: '', destination: '', origin_point: null, destination_point: null, seats: 1 } }));
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'UCM');
    await user.click(await screen.findByRole('option', { name: origin.label }));
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'Walmart');
    await user.click(await screen.findByRole('option', { name: destination.label }));
    expect(screen.getByText(/From → To: 1.93 miles/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm & post' }));
    await waitFor(() => expect(createPost).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      origin: origin.label, destination: destination.label, origin_point: origin.point, destination_point: destination.point,
    }) }));
    await user.clear(screen.getByRole('combobox', { name: 'To' }));
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'Different place');
    expect(screen.getByText('Choose both locations to calculate distance.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm & post' }));
    expect(createPost).toHaveBeenCalledOnce();
    expect(screen.getByText('Choose a valid To location from the suggestions or optional map.')).toBeInTheDocument();
  });
  it('automatically maps locations from a ride sentence and submits both valid pins after review', async () => {
    vi.stubEnv('VITE_MAPTILER_API_KEY', 'synthetic');
    const origin = { id: 'ucm', label: 'University of Central Missouri, Warrensburg', point: { lat: 38.7625, lng: -93.7395 } };
    const destination = { id: 'walmart', label: 'Walmart Supercenter, Warrensburg', point: { lat: 38.7905, lng: -93.7390 } };
    locations.resolve.mockImplementation(async (hint: string) => ({ place: hint === 'UCM' ? origin : destination, candidates: [] }));
    const { user, createPost, onCreated } = setup(study({ category: 'RIDE', intent: 'OFFER', title: 'Synthetic campus ride',
      text: 'Offering four seats from UCM to Walmart tonight at six pm', starts_at: '2026-10-03T18:00:00-05:00',
      details: { origin: 'UCM', destination: 'Walmart', seats: 4, origin_point: null, destination_point: null } }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue(origin.label));
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue(destination.label);
    expect(screen.queryByRole('button', { name: 'Select From point' })).not.toBeInTheDocument();
    expect(screen.getByText(/From → To: 1.93 miles straight-line/)).toBeInTheDocument();
    expect(createPost).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm & post' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      origin: origin.label, destination: destination.label, origin_point: origin.point, destination_point: destination.point, seats: 4,
    }) }));
  });
  it('preserves a manual destination pin/name when automatic sentence lookup finishes late', async () => {
    vi.stubEnv('VITE_MAPTILER_API_KEY', 'synthetic');
    let finish!: (result: unknown) => void;
    locations.resolve.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { user } = setup(study({ category: 'RIDE', details: {
      origin: null, destination: 'Walmart', seats: 1, origin_point: null, destination_point: null,
    } }));
    await screen.findByText('Finding To from your sentence…');
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    await user.click(await screen.findByRole('button', { name: 'Select To awaiting name' }));
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'Walmart west entrance');
    await waitFor(() => expect(locations.resolve.mock.calls[0][1].aborted).toBe(true));
    finish({ place: { id: 'old', label: 'Old automatic destination', point: { lat: 0, lng: 0 } }, candidates: [] });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Walmart west entrance'));
  });
  it('maps a changed follow-up destination instead of keeping the earlier automatic pin', async () => {
    vi.stubEnv('VITE_MAPTILER_API_KEY', 'synthetic');
    const destinations = {
      UCM: { id: 'ucm', label: 'UCM campus', point: { lat: 38.7625, lng: -93.7395 } },
      Walmart: { id: 'walmart', label: 'Walmart Supercenter', point: { lat: 38.7905, lng: -93.7390 } },
      'Union Station': { id: 'station', label: 'Union Station, Kansas City', point: { lat: 39.084, lng: -94.585 } },
    };
    locations.resolve.mockImplementation(async (hint: keyof typeof destinations) => ({ place: destinations[hint], candidates: [] }));
    const preview = study({ category: 'RIDE', details: { origin: 'UCM', destination: 'Walmart', seats: 1,
      origin_point: null, destination_point: null } });
    const { user, understand, createPost } = setup(preview);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Walmart Supercenter'));
    understand.mockResolvedValue({ ...preview, analysis_mode: 'HEURISTIC', details: { ...preview.details, destination: 'Union Station' } });
    await user.type(screen.getByRole('textbox', { name: 'Add missing details' }), 'Go to Union Station instead.');
    await user.click(screen.getByRole('button', { name: 'Fill in my form' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Union Station, Kansas City'));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:00' } });
    await user.click(screen.getByRole('button', { name: 'Confirm & post' }));
    await waitFor(() => expect(createPost).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      destination: 'Union Station, Kansas City', destination_point: destinations['Union Station'].point,
    }) }));
  });
  it("requires two explicit map selections for an offer and keeps them through AI follow-up", async () => {
    const preview = study({ category: "RIDE", intent: "OFFER", title: "Synthetic ride",
      text: "Offering four seats", starts_at: null,
      details: { origin: "Old pickup", destination: "Old destination", seats: 4, origin_point: null, destination_point: null } });
    const { user, understand, createPost, onCreated } = setup(preview);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "18:00" } });
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    expect(createPost).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    await user.click(await screen.findByRole("button", { name: "Select From point" }));
    await user.click(screen.getByRole("button", { name: "Select To point" }));
    // Leave a question for a sentence follow-up, after explicitly chosen map pins.
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "" } });
    understand.mockImplementation(async () => ({ ...preview, starts_at: "2026-10-03T19:00:00-05:00",
      details: { origin: "Invented origin", destination: "Invented destination", seats: 4, origin_point: null, destination_point: null } }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "Tonight at seven pm.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText(/Your form is updated/);
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("Campus");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("Walmart");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-03" } });
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({
      seats: 4, origin_point: { lat: 38.7625, lng: -93.7395 }, destination_point: { lat: 38.7905, lng: -93.7390 },
    }) }));
  });
  it('fills the destination name after pin lookup while preserving a manual name typed during lookup', async () => {
    setup(study({ category: 'RIDE', details: { origin: 'Campus', destination: 'Old destination', seats: 1,
      origin_point: null, destination_point: null } }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    await user.click(await screen.findByRole('button', { name: 'Select To awaiting name' }));
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Resolve To name' }));
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Walmart');
    await user.click(screen.getByRole('button', { name: 'Select To awaiting name' }));
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'Walmart west entrance');
    await user.click(screen.getByRole('button', { name: 'Resolve To name' }));
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Walmart west entrance');
  });
  it('replaces old numeric draft labels with resolved names without automatically saving', async () => {
    const { createPost, user } = setup(study({ category: 'RIDE', details: {
      origin: 'College Avenue', destination: 'Destination (38.79050, -93.73900)', seats: 1,
      origin_point: { lat: 38.7625, lng: -93.7395 }, destination_point: { lat: 38.7905, lng: -93.7390 },
    } }));
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    await user.click(await screen.findByRole('button', { name: 'Resolve To name' }));
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Walmart');
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('College Avenue');
    expect(createPost).not.toHaveBeenCalled();
  });
  it("prefills all supplied facts and asks only for relevant missing information", async () => {
    const { user } = setup();
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("SQL");
    expect(screen.getByRole("textbox", { name: "Topic" })).toHaveValue("joins");
    const questions = within(screen.getByRole("region", { name: "Missing details" }));
    expect(questions.getByText(/Would you like to meet online or in person/)).toBeInTheDocument();
    expect(questions.getByText(/When are you available/)).toBeInTheDocument();
    expect(questions.queryByText(/Which course/)).not.toBeInTheDocument();
    expect(questions.queryByText(/Where would you like/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Meeting mode" }), "IN_PERSON");
    expect(questions.getByText(/Where would you like to meet/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Location (optional)" }), "Library");
    expect(questions.queryByText(/Where would you like/)).not.toBeInTheDocument();
  });

  it("uses a sentence to update the form, preserves reference time, and waits for explicit posting", async () => {
    const { understand, createPost, user, onCreated } = setup();
    understand.mockImplementation(async (input) => study({ text: input.text, location: "Library",
      starts_at: "2026-10-03T18:00:00-05:00", ends_at: "2026-10-03T19:00:00-05:00",
      details: { course: "SQL", topic: "joins", skill_level: null, mode: "IN_PERSON" } }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "Tonight from six to seven pm, in person at the Library.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText("Your form is updated. Review the details before posting.");
    expect(understand).toHaveBeenCalledWith({ ...context, category_hint: "STUDY",
      text: "I need help studying SQL joins tonight\nAdditional details: Tonight from six to seven pm, in person at the Library." });
    expect(screen.getByRole("textbox", { name: "Location (optional)" })).toHaveValue("Library");
    expect(screen.getByRole("combobox", { name: "Meeting mode" })).toHaveValue("IN_PERSON");
    expect(screen.getByLabelText("Start date (optional)")).toHaveValue("2026-10-03");
    expect(screen.getByLabelText("Start time (optional)")).toHaveValue("18:00");
    expect(screen.getByLabelText("End date (optional)")).toHaveValue("2026-10-03");
    expect(screen.getByLabelText("End time (optional)")).toHaveValue("19:00");
    expect(screen.queryByRole("region", { name: "Missing details" })).not.toBeInTheDocument();
    expect(createPost).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ location: "Library",
      details: { course: "SQL", topic: "joins", skill_level: null, mode: "IN_PERSON" } }));
  });

  it("keeps manual corrections while adding the remaining facts from AI", async () => {
    const { understand, user } = setup();
    await user.clear(screen.getByRole("textbox", { name: "Course" }));
    await user.type(screen.getByRole("textbox", { name: "Course" }), "CS 201");
    await user.type(screen.getByRole("textbox", { name: "Location (optional)" }), "Student Union");
    fireEvent.change(screen.getByLabelText("Start date (optional)"), { target: { value: "2026-10-04" } });
    fireEvent.change(screen.getByLabelText("Start time (optional)"), { target: { value: "22:00" } });
    understand.mockImplementation(async (input) => study({ text: input.text, location: "Library",
      starts_at: "2026-10-03T18:00:00-05:00", ends_at: "2026-10-03T19:00:00-05:00",
      details: { course: "SQL", topic: "joins", skill_level: null, mode: "IN_PERSON" } }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "In person tonight from 6 to 7 pm.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText(/Your form is updated/);
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("CS 201");
    expect(screen.getByRole("textbox", { name: "Location (optional)" })).toHaveValue("Student Union");
    expect(screen.getByLabelText("Start date (optional)")).toHaveValue("2026-10-04");
    expect(screen.getByLabelText("Start time (optional)")).toHaveValue("22:00");
  });

  it("retains valid extracted facts during offline fallback and displays its mode", async () => {
    const { understand, user } = setup(study({ location: "Library", details: { course: "SQL", topic: "joins", mode: "IN_PERSON", skill_level: null } }));
    understand.mockImplementation(async (input) => study({ text: input.text, details: { course: null, topic: null, mode: null, skill_level: null },
      warnings: ["Configured provider is unavailable; using the heuristic fallback."], analysis_mode: "HEURISTIC" }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "Tomorrow from 6 to 7 pm.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText("Preview mode: heuristic");
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("SQL");
    expect(screen.getByRole("textbox", { name: "Location (optional)" })).toHaveValue("Library");
    expect(screen.getByRole("combobox", { name: "Meeting mode" })).toHaveValue("IN_PERSON");
  });

  it("preserves draft and answer on failure and disables posting while updating", async () => {
    const { understand, createPost, user } = setup();
    let reject: (reason: unknown) => void = () => {};
    understand.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "Tomorrow evening.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    expect(screen.getByRole("button", { name: "Confirm & post" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Course" })).toBeDisabled();
    reject(new Error("Connection interrupted. Try again."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
    expect(screen.getByRole("textbox", { name: "Add missing details" })).toHaveValue("Tomorrow evening.");
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("SQL");
    expect(screen.getByRole("button", { name: "Confirm & post" })).toBeEnabled();
    expect(createPost).not.toHaveBeenCalled();
  });

  it("does not ask again for fully provided facts or ask online students for a location", () => {
    setup(study({ starts_at: "2026-10-03T18:00:00-05:00", ends_at: "2026-10-03T19:00:00-05:00",
      details: { course: "SQL", topic: "joins", mode: "ONLINE", skill_level: null } }));
    expect(screen.queryByRole("region", { name: "Missing details" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("SQL");
  });

  it("asks for missing Ride logistics without asking again for the supplied destination", () => {
    setup(study({ category: "RIDE", title: "Ride to Walmart", text: "I need a ride to Walmart",
      details: { origin: null, destination: "Walmart", seats: null, purpose: null },
      missing_fields: ["details.origin", "details.seats", "starts_at"] }));
    const questions = within(screen.getByRole("region", { name: "Missing details" }));
    expect(questions.getByText(/Where are you starting from/)).toBeInTheDocument();
    expect(questions.getByText(/How many seats do you need/)).toBeInTheDocument();
    expect(questions.getByText(/What day and time should the ride leave/)).toBeInTheDocument();
    expect(questions.queryByText(/Where are you going/)).not.toBeInTheDocument();
  });
});
