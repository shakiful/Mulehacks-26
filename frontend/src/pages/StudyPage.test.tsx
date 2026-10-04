import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../App";
import { createMockApi } from "../api/mock";
import type { Understanding } from "../api/types";
import { ApiProvider } from "../context/ApiContext";

const description = "Synthetic study request: SQL joins at the Library on October 4, 2026 from 10 to 11 PM.";
const preview: Understanding = {
  category: "STUDY", intent: "REQUEST", title: "SQL joins study help", text: description,
  location: "Library", starts_at: "2026-10-05T03:00:00Z", ends_at: "2026-10-05T04:00:00Z",
  details: { course: "SQL", topic: "joins", skill_level: "BEGINNER", mode: "IN_PERSON" },
  missing_fields: [], warnings: [], analysis_mode: "LLM",
};

async function setup() {
  const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
  const understand = vi.fn(api.understand).mockResolvedValue(preview);
  const createPost = vi.fn(api.createPost);
  render(<ApiProvider client={{ ...api, understand, createPost }} mockMode={false}>
    <MemoryRouter initialEntries={["/study"]}><AppRoutes /></MemoryRouter>
  </ApiProvider>);
  await screen.findByRole("heading", { name: "Study Connect" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Create study post" }));
  return { api, understand, createPost, user };
}

describe("Study Connect post creation", () => {
  it("extracts a Study description, allows corrections, and saves only after confirmation before opening matches", async () => {
    const { api, understand, createPost, user } = await setup();
    expect(screen.getByRole("button", { name: "Close form" })).toHaveAttribute("aria-expanded", "true");
    await user.type(screen.getByRole("textbox", { name: "Describe your study needs" }), description);
    await user.click(screen.getByRole("button", { name: "Preview study post" }));
    await screen.findByText("Preview mode: llm");
    expect(understand).toHaveBeenCalledWith({ text: description, category_hint: "STUDY",
      reference_time: expect.any(String), timezone: "America/Chicago" });
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("STUDY");
    expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Course" })).toHaveValue("SQL");
    expect(screen.getByRole("textbox", { name: "Topic" })).toHaveValue("joins");
    expect(screen.getByRole("combobox", { name: "Meeting mode" })).toHaveValue("IN_PERSON");
    expect(screen.getByRole("textbox", { name: "Location (optional)" })).toHaveValue("Library");
    expect(screen.getByLabelText("Start date (optional)")).toHaveValue("2026-10-04");
    expect(screen.getByLabelText("Start time (optional)")).toHaveValue("22:00");
    expect(createPost).not.toHaveBeenCalled();
    await user.clear(screen.getByRole("textbox", { name: "Course" }));
    await user.type(screen.getByRole("textbox", { name: "Course" }), "CS 201");
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    await screen.findByRole("heading", { name: "No compatible matches yet." });
    expect(createPost).toHaveBeenCalledOnce();
    expect(createPost).toHaveBeenCalledWith({ category: "STUDY", intent: "REQUEST",
      title: preview.title, text: description, location: "Library",
      starts_at: preview.starts_at, ends_at: preview.ends_at,
      details: { ...preview.details, course: "CS 201" } });
    const saved = (await api.listPosts({ category: "STUDY", user_id: 1 })).items.find(post => post.title === preview.title);
    expect(saved?.author.id).toBe(1);
    expect(saved?.details).toEqual({ ...preview.details, course: "CS 201" });
  });

  it("preserves the description on extraction failure, retries, and offers follow-up autofill with the original clock", async () => {
    const { understand, createPost, user } = await setup();
    let reject: (reason: Error) => void = () => {};
    understand.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await user.type(screen.getByRole("textbox", { name: "Describe your study needs" }), "I need help studying SQL joins tonight");
    await user.click(screen.getByRole("button", { name: "Preview study post" }));
    expect(screen.getByRole("button", { name: "Preparing preview…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Describe your study needs" })).toBeDisabled();
    await act(async () => reject(new Error("Could not prepare the preview. Try again.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare the preview");
    expect(screen.getByRole("textbox", { name: "Describe your study needs" })).toHaveValue("I need help studying SQL joins tonight");
    understand.mockResolvedValueOnce({ ...preview, text: "I need help studying SQL joins tonight",
      location: null, starts_at: null, ends_at: null, details: { ...preview.details, mode: null } });
    await user.click(screen.getByRole("button", { name: "Preview study post" }));
    await screen.findByRole("region", { name: "Missing details" });
    const initialInput = understand.mock.calls[1][0];
    understand.mockImplementationOnce(async (input) => ({ ...preview, text: input.text }));
    await user.type(screen.getByRole("textbox", { name: "Add missing details" }), "In person at the Library from 10 to 11 PM tonight.");
    await user.click(screen.getByRole("button", { name: "Fill in my form" }));
    await screen.findByText("Your form is updated. Review the details before posting.");
    expect(understand).toHaveBeenLastCalledWith({
      text: "I need help studying SQL joins tonight\nAdditional details: In person at the Library from 10 to 11 PM tonight.",
      category_hint: "STUDY", reference_time: initialInput.reference_time, timezone: initialInput.timezone,
    });
    expect(screen.getByRole("textbox", { name: "Location (optional)" })).toHaveValue("Library");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("discards a closed form and ignores a late preview instead of restoring its old draft", async () => {
    const { understand, createPost, user } = await setup();
    let resolve: (value: Understanding) => void = () => {};
    understand.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await user.click(screen.getByRole("button", { name: "Help with SQL" }));
    await user.click(screen.getByRole("button", { name: "Preview study post" }));
    await user.click(screen.getByRole("button", { name: "Close form" }));
    await user.click(screen.getByRole("button", { name: "Create study post" }));
    await act(async () => resolve(preview));
    expect(screen.getByRole("textbox", { name: "Describe your study needs" })).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Review your post" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview study post" })).toBeEnabled();
    await waitFor(() => expect(createPost).not.toHaveBeenCalled());
  });
});
