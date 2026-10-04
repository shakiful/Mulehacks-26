import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "../api/mock";
import { ApiError } from "../api/errors";
import type { CreatePostInput, Post } from "../api/types";
import { ApiProvider } from "../context/ApiContext";
import { CreatePost } from "./CreatePost";
vi.mock("./RideRoutePicker", () => import("../test/MockRideRoutePicker"));
const places = vi.hoisted(() => ({ suggest: vi.fn() }));
vi.mock('../lib/places', async (original) => ({ ...await original<typeof import('../lib/places')>(), suggestPlaces: places.suggest }));

const common = { title: "Synthetic original post", text: "Synthetic editable description",
  location: "Library", starts_at: "2026-10-03T18:00:00-05:00", ends_at: "2026-10-03T19:00:00-05:00" };
const cases: [string, CreatePostInput, string, string][] = [
  ["Ride", { ...common, category: "RIDE", intent: "REQUEST", details: { origin: "UCM", destination: "Walmart", seats: 1, purpose: null,
    origin_point: { lat: 38.7625, lng: -93.7395 }, destination_point: { lat: 38.7905, lng: -93.7390 } } }, "To", "Target"],
  ["Study", { ...common, category: "STUDY", intent: "PARTNER", details: { course: "SQL", topic: "joins", mode: "IN_PERSON", skill_level: "BEGINNER" } }, "Topic", "indexes"],
  ["Food", { ...common, category: "RESTAURANT", intent: "OFFER", details: { restaurant: "Example diner", cuisine: null, activity_type: "DINING", group_size: 2 } }, "Restaurant", "Campus cafe"],
  ["Community", { ...common, category: "COMMUNITY", intent: "OFFER", details: { subcategory: "BORROW_LEND", item: "Calculator", activity: null } }, "Item (optional)", "Scientific calculator"],
];

function setup(input: CreatePostInput, ride_availability?: Post['ride_availability']) {
  const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
  const editPost = vi.fn(api.editPost), createPost = vi.fn(api.createPost), onCreated = vi.fn();
  const post = { ...input, id: 42, author: { id: 1, name: "Rafi" }, status: "OPEN",
    created_at: "2026-10-03T12:00:00Z", updated_at: "2026-10-03T12:00:00Z", ride_availability } as Post;
  editPost.mockResolvedValue(post);
  render(<ApiProvider client={{ ...api, editPost, createPost }}>
    <CreatePost initialPost={post} onCreated={onCreated} onCancel={vi.fn()} />
  </ApiProvider>);
  return { editPost, createPost, onCreated, user: userEvent.setup() };
}

describe("saved post editor", () => {
  it('protects accepted passengers by locking the route fields and optional map', async () => {
    const input = { ...cases[0][1], intent: 'OFFER', details: { ...cases[0][1].details, seats: 4 } } as CreatePostInput;
    const { user, editPost } = setup(input, { total_seats: 4, reserved_seats: 1, remaining_seats: 3 });
    expect(screen.getByRole('combobox', { name: 'From' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'To' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    expect(await screen.findByRole('button', { name: 'Select From point' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(editPost).toHaveBeenCalledWith(42, expect.objectContaining({ details: input.details }));
  });
  it.each(cases)("prefills and saves %s details without creating another post", async (_name, input, label, value) => {
    const { user, editPost, createPost, onCreated } = setup(input);
    expect(screen.getByRole("textbox", { name: "Post title" })).toHaveValue(input.title);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(input.text);
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(input.category);
    expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();
    const required = ["RIDE", "RESTAURANT"].includes(input.category);
    expect(screen.getByLabelText(`Start date${required ? "" : " (optional)"}`)).toHaveValue("2026-10-03");
    expect(screen.getByLabelText(`Start time${required ? "" : " (optional)"}`)).toHaveValue("18:00");
    if (input.category === 'RIDE') {
      vi.stubEnv('VITE_MAPTILER_API_KEY', 'synthetic');
      places.suggest.mockResolvedValue([{ id: 'target', label: value, point: { lat: 38.8, lng: -93.73 } }]);
    }
    const field = screen.getByRole(input.category === 'RIDE' ? 'combobox' : 'textbox', { name: label });
    await user.clear(field);
    await user.type(field, value);
    if (input.category === 'RIDE') await user.click(await screen.findByRole('option', { name: value }));
    await user.clear(screen.getByRole("textbox", { name: "Location (optional)" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editPost).toHaveBeenCalledWith(42, expect.objectContaining({
      category: input.category, intent: input.intent, location: null, title: input.title,
      details: expect.objectContaining({ [({ RIDE: "destination", STUDY: "topic", RESTAURANT: "restaurant", COMMUNITY: "item" })[input.category]]: value }),
    }));
    expect(createPost).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledOnce();
  });
  it("saves a selected campus date and 10 PM time as the correct UTC instant", async () => {
    const { user, editPost } = setup(cases[0][1]);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-04" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "22:00" } });
    await user.click(screen.getByRole("button", { name: "Clear end date and time" }));
    expect(screen.getByText(/October 4, 2026.*10:00 PM CDT/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editPost).toHaveBeenCalledWith(42, expect.objectContaining({ starts_at: "2026-10-05T03:00:00.000Z", ends_at: null }));
  });
  it("requires both date and time even when availability is optional and validates end order", async () => {
    const { user, editPost } = setup(cases[1][1]);
    fireEvent.change(screen.getByLabelText("Start time (optional)"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Choose both a date and a time.")).toBeInTheDocument();
    expect(editPost).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Start time (optional)"), { target: { value: "20:00" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("End time must be later than the start time.")).toBeInTheDocument();
    expect(editPost).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear end date and time" }));
    await user.click(screen.getByRole("button", { name: "Clear start date and time" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editPost).toHaveBeenCalledWith(42, expect.objectContaining({ starts_at: null, ends_at: null }));
  });
  it("asks which occurrence of a repeated 1:30 AM should be saved", async () => {
    const { user, editPost } = setup(cases[0][1]);
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "01:30" } });
    await user.click(screen.getByRole("button", { name: "Clear end date and time" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editPost).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Start time occurrence" }), "2026-11-01T07:30:00.000Z");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editPost).toHaveBeenCalledWith(42, expect.objectContaining({ starts_at: "2026-11-01T07:30:00.000Z" }));
  });
  it("blocks invalid saves and preserves the draft when the server rejects a change", async () => {
    const { user, editPost, onCreated } = setup(cases[0][1]);
    const title = screen.getByRole("textbox", { name: "Post title" });
    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editPost).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("before saving");
    await user.type(title, "My corrected ride");
    editPost.mockRejectedValueOnce(new ApiError(503, { error: { code: "UNAVAILABLE", message: "Try saving again.", details: [] } }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try saving again.");
    expect(title).toHaveValue("My corrected ride");
    expect(onCreated).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onCreated).toHaveBeenCalledOnce();
  });
});
