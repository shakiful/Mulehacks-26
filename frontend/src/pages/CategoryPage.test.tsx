import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../App";
import { createMockApi } from "../api/mock";
import type { Understanding } from "../api/types";
import { ApiProvider } from "../context/ApiContext";

vi.mock("../components/RideRoutePicker", () => import("../test/MockRideRoutePicker"));
const locations = vi.hoisted(() => ({ resolve: vi.fn(), suggest: vi.fn(), reverse: vi.fn() }));
vi.mock("../lib/places", async (original) => ({ ...await original<typeof import("../lib/places")>(),
  resolveRidePlace: locations.resolve, suggestPlaces: locations.suggest, reversePlace: locations.reverse }));
beforeEach(() => {
  locations.resolve.mockReset().mockResolvedValue({ place: null, candidates: [] });
  locations.suggest.mockReset().mockResolvedValue([]);
  locations.reverse.mockReset().mockResolvedValue(null);
});
const originPoint = { lat: 38.7625, lng: -93.7395 };
const destinationPoint = { lat: 38.7905, lng: -93.7390 };

const description = "Synthetic ride offer: UCM to Walmart on October 4, 2026 at 10 PM, with four seats for groceries.";
const ride: Understanding = {
  category: "RIDE", intent: "OFFER", title: "Walmart ride offer", text: description,
  location: null, starts_at: "2026-10-05T03:00:00Z", ends_at: null,
  details: { origin: "UCM", destination: "Walmart", origin_point: null, destination_point: null, seats: 4, purpose: "groceries" },
  missing_fields: ["details.origin_point", "details.destination_point"], warnings: [], analysis_mode: "LLM",
};
async function setup(preview = ride) {
  const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
  const understand = vi.fn(api.understand).mockResolvedValue(preview);
  const createPost = vi.fn(api.createPost);
  render(<ApiProvider client={{ ...api, understand, createPost }} mockMode={false}>
    <MemoryRouter initialEntries={["/ride"]}><AppRoutes /></MemoryRouter>
  </ApiProvider>);
  await screen.findByRole("heading", { name: "Ride Connect" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Create ride post" }));
  return { understand, createPost, user };
}

describe("Ride Connect AI post creation", () => {
  it("autofills an offer's route, seats and campus time, allows corrections, and saves on confirmation", async () => {
    vi.stubEnv("VITE_MAPTILER_API_KEY", "synthetic");
    locations.resolve.mockImplementation(async (hint: string) => ({
      place: { id: hint, label: hint, point: hint === "UCM" ? originPoint : destinationPoint }, candidates: [],
    }));
    const { understand, createPost, user } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Describe your ride" }), description);
    await user.click(screen.getByRole("button", { name: "Preview ride post" }));
    await screen.findByText("Preview mode: llm");
    expect(understand).toHaveBeenCalledWith({ text: description, category_hint: "RIDE",
      reference_time: expect.any(String), timezone: "America/Chicago" });
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("RIDE");
    expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "I want to…" })).toHaveValue("OFFER");
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("UCM");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("Walmart");
    await within(screen.getByRole("region", { name: "Review your post" })).findByText(/From → To:.*miles/);
    expect(screen.queryByRole("button", { name: "Select From point" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Seats available" })).toHaveValue(4);
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-10-04");
    expect(screen.getByLabelText("Start time")).toHaveValue("22:00");
    expect(createPost).not.toHaveBeenCalled();
    await user.clear(screen.getByRole("spinbutton", { name: "Seats available" }));
    await user.type(screen.getByRole("spinbutton", { name: "Seats available" }), "3");
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    await screen.findByRole("heading", { name: "No compatible matches yet." });
    expect(createPost).toHaveBeenCalledOnce();
    expect(createPost).toHaveBeenCalledWith({ category: "RIDE", intent: "OFFER", title: ride.title,
      text: description, location: null, starts_at: ride.starts_at, ends_at: null,
      details: { ...ride.details, origin_point: originPoint, destination_point: destinationPoint, seats: 3 } });
  });

  it("asks for missing Ride logistics and fills a follow-up without overwriting a manually chosen origin", async () => {
    const { understand, createPost, user } = await setup({ ...ride, intent: "REQUEST", text: "I need a ride to Walmart",
      starts_at: null, details: { origin: null, destination: "Walmart", seats: null, purpose: null },
      missing_fields: ["details.origin", "details.seats", "starts_at"] });
    await user.type(screen.getByRole("textbox", { name: "Describe your ride" }), "I need a ride to Walmart");
    await user.click(screen.getByRole("button", { name: "Preview ride post" }));
    await screen.findByRole("region", { name: "Missing details" });
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("Walmart");
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Correct the highlighted fields");
    expect(createPost).not.toHaveBeenCalled();
    await user.type(screen.getByRole("combobox", { name: "From" }), "Student Union");
    understand.mockImplementationOnce(async input => ({ ...ride, text: input.text, intent: "REQUEST",
      details: { origin: "UCM", destination: "Walmart", seats: 2, purpose: null } }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "From UCM tonight at 10 PM for two people.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText("Your form is updated. Review the details before posting.");
    expect(understand).toHaveBeenLastCalledWith({
      text: "I need a ride to Walmart\nAdditional details: From UCM tonight at 10 PM for two people.",
      category_hint: "RIDE", reference_time: understand.mock.calls[0][0].reference_time, timezone: "America/Chicago",
    });
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("Student Union");
    expect(screen.getByRole("spinbutton", { name: "Seats needed" })).toHaveValue(2);
    expect(screen.getByLabelText("Start time")).toHaveValue("22:00");
    expect(createPost).not.toHaveBeenCalled();
  });
});
