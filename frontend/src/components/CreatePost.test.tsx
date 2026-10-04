import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "../api/mock";
import type { Understanding } from "../api/types";
import { ApiProvider } from "../context/ApiContext";
import { CreatePost } from "./CreatePost";

const context = { reference_time: "2026-10-03T16:00:00-05:00", timezone: "America/Chicago" };
const study = (changes: Partial<Understanding> = {}): Understanding => ({
  category: "STUDY", intent: "REQUEST", title: "Help with SQL joins",
  text: "I need help studying SQL joins tonight", location: null, starts_at: null, ends_at: null,
  details: { course: "SQL", topic: "joins", skill_level: null, mode: null },
  missing_fields: [], warnings: [], analysis_mode: "LLM", ...changes,
});

function setup(preview = study()) {
  const api = createMockApi({ getDemoUserId: () => 1, delayMs: 0 });
  const understand = vi.fn(api.understand);
  const createPost = vi.fn(api.createPost);
  const onCreated = vi.fn();
  render(<ApiProvider client={{ ...api, understand, createPost }} mockMode={false}>
    <CreatePost preview={preview} previewContext={context} onCreated={onCreated} />
  </ApiProvider>);
  return { understand, createPost, onCreated, user: userEvent.setup() };
}

describe("conversational post clarification", () => {
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
    expect(screen.getByRole("textbox", { name: "Start date & time (optional)" })).toHaveValue("2026-10-03T18:00:00-05:00");
    expect(screen.getByRole("textbox", { name: "End date & time (optional)" })).toHaveValue("2026-10-03T19:00:00-05:00");
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
    understand.mockImplementation(async (input) => study({ text: input.text, location: "Library",
      starts_at: "2026-10-03T18:00:00-05:00", ends_at: "2026-10-03T19:00:00-05:00",
      details: { course: "SQL", topic: "joins", skill_level: null, mode: "IN_PERSON" } }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "In person tonight from 6 to 7 pm.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText(/Your form is updated/);
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("CS 201");
    expect(screen.getByRole("textbox", { name: "Location (optional)" })).toHaveValue("Student Union");
    expect(screen.getByRole("textbox", { name: "Start date & time (optional)" })).toHaveValue("2026-10-03T18:00:00-05:00");
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
