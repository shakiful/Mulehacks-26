import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider, useApi } from "./context/ApiContext";
import { createMockApi } from "./api/mock";
import type { MockScenario } from "./api/mock";
import { AppRoutes } from "./App";
vi.mock("./components/RideRoutePicker", () => import("./test/MockRideRoutePicker"));

function renderApp(path = "/") {
  let scenario: MockScenario = "normal";
  function ScenarioBridge() {
    scenario = useApi().scenario;
    return null;
  }
  return render(
    <ApiProvider mockMode client={createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 50, getScenario: () => scenario })}>
      <ScenarioBridge />
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ApiProvider>,
  );
}
const navigationLink = (name: string) =>
  within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole(
    "link",
    { name },
  );
async function switchStudent(user: ReturnType<typeof userEvent.setup>, username: string) {
  await user.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.type(screen.getByRole("textbox", { name: "Username" }), username);
  await user.type(screen.getByLabelText("Password"), "fixture-only");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("navigation", { name: "Main navigation" });
}
describe("frontend workflows", () => {
  it("edits the author's existing post, returns to My posts, and keeps one record", async () => {
    const user = userEvent.setup();
    renderApp("/my-posts");
    await screen.findByRole("heading", { name: "Your open posts" }, { timeout: 3000 });
    const card = (await screen.findByRole('heading', { name: 'Help with SQL joins' })).closest('article')!;
    const postCount = screen.getAllByRole("article").length;
    const edit = within(card).getByRole("link", { name: "Edit post" });
    expect(edit).toHaveAttribute("href", "/posts/42/edit");
    await user.click(edit);
    expect(await screen.findByRole("textbox", { name: "Post title" })).toHaveValue("Help with SQL joins");
    expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();
    await user.clear(screen.getByRole("textbox", { name: "Post title" }));
    await user.type(screen.getByRole("textbox", { name: "Post title" }), "Updated SQL help");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Post updated. Your changes are saved.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Updated SQL help" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(postCount);
    expect(screen.getAllByRole('heading', { name: 'Updated SQL help' })).toHaveLength(1);
    expect(within(screen.getByRole('heading', { name: 'Updated SQL help' }).closest('article')!)
      .getByRole("link", { name: "Edit post" })).toHaveAttribute("href", "/posts/42/edit");
  });
  it("cancels edits without saving and hides editing another student's post", async () => {
    const user = userEvent.setup();
    renderApp("/posts/42/edit");
    const title = await screen.findByRole("textbox", { name: "Post title" });
    await user.clear(title);
    await user.type(title, "Unsaved title");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Help with SQL joins" })).toBeInTheDocument();
    await user.click(within(screen.getByRole('heading', { name: 'Help with SQL joins' }).closest('article')!)
      .getByRole("link", { name: "Edit post" }));
    await screen.findByRole("button", { name: "Save changes" });
    await switchStudent(user, "afsana");
    await user.click(navigationLink("Dashboard"));
    await screen.findByRole("heading", { name: "Help with SQL joins" });
    const card = screen.getByRole("heading", { name: "Help with SQL joins" }).closest("article")!;
    expect(within(card).queryByRole("link", { name: "Edit post" })).not.toBeInTheDocument();
  });
  it("shows loading, dashboard shortcuts, signed-in students, and empty/error recovery", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your session",
    );
    expect(
      await screen.findByRole("heading", { name: /Good things start/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Help with SQL joins" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Demo profile" })).not.toBeInTheDocument();
    expect(screen.getByText("Signed in as")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Response states" }),
      "empty",
    );
    expect(
      await screen.findByRole("heading", {
        name: "A little quiet here, for now.",
      }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Response states" }),
      "error",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Response states" }),
      "normal",
    );
    expect(
      await screen.findByRole("heading", { name: "Help with SQL joins" }),
    ).toBeInTheDocument();
  });
  it("requests a fixture connection and accepts it under the recipient profile", async () => {
    const user = userEvent.setup();
    renderApp("/posts/42/matches");
    const request = await screen.findByRole(
      "button",
      { name: "Request connection" },
      { timeout: 3000 },
    );
    expect(screen.getByText("Compatibility score")).toBeInTheDocument();
    await user.click(request);
    expect(
      await screen.findByRole("button", { name: "Request sent" }),
    ).toBeDisabled();
    await switchStudent(user, "afsana");
    await user.click(navigationLink("Connections"));
    const accept = await screen.findByRole("button", { name: "Accept" });
    expect(
      screen.getByRole("heading", { name: "Request from Rafi" }),
    ).toBeInTheDocument();
    await user.click(accept);
    expect(
      await screen.findByText("accepted", { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept" }),
    ).not.toBeInTheDocument();
    await user.click(navigationLink("My posts"));
    expect(
      await screen.findByRole("heading", {
        name: "Relational database tutoring",
      }),
    ).toBeInTheDocument();
  });
  it("requires Ride clarification, then creates a post and displays empty matches", async () => {
    const user = userEvent.setup();
    renderApp("/ride");
    await screen.findByRole("heading", { name: "Ride Connect" });
    await user.click(screen.getByRole("button", { name: "Create a post" }));
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Correct the highlighted fields",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Post title" }),
      "Walmart ride",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Synthetic ride request",
    );
    await user.type(screen.getByRole("combobox", { name: "From" }), "UCM");
    await user.type(screen.getByRole("combobox", { name: "To" }), "Walmart");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "18:00" } });
    await user.click(screen.getByRole('button', { name: 'Show map (optional)' }));
    await user.click(await screen.findByRole("button", { name: "Select From point" }));
    await user.click(screen.getByRole("button", { name: "Select To point" }));
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    expect(
      await screen.findByRole(
        "heading",
        { name: "No compatible matches yet." },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    await user.click(navigationLink("My posts"));
    expect(
      await screen.findByRole("heading", { name: "Walmart ride" }),
    ).toBeInTheDocument();
  });
  it("routes cybersecurity previews privately without creating a public post", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: /Good things start/ });
    await user.type(
      screen.getByRole("textbox", { name: "Describe what you need" }),
      "Your account expires today",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Preview category" }),
      "CYBERSECURITY",
    );
    await user.click(
      screen.getByRole("button", { name: "Find my connections" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Check a suspicious message",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Your account expires today"),
    ).not.toBeInTheDocument();
    await user.click(navigationLink("Dashboard"));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Help with SQL joins" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Your account expires today"),
    ).not.toBeInTheDocument();
  });
  it("exposes missing preview facts for correction and keeps a manual category choice", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: /Good things start/ });
    await user.click(screen.getByRole("button", { name: "A ride to Walmart" }));
    await user.click(
      screen.getByRole("button", { name: "Find my connections" }),
    );
    await screen.findByRole("heading", {
      name: "A quick check before you connect.",
    });
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("");
    expect(
      screen.getByLabelText("Start date"),
    ).toHaveValue("");
    expect(
      screen.getByText(/Please confirm: origin point, destination point, origin, destination, starts at/),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Category" }),
      "COMMUNITY",
    );
    expect(
      screen.getByRole("combobox", { name: "Community category" }),
    ).toHaveValue("OTHER");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "I need a ride to Walmart around 6 tonight",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "I want to…" }),
      "PARTNER",
    );
    await user.click(screen.getByRole("button", { name: "Confirm & post" }));
    expect(
      await screen.findByRole(
        "heading",
        { name: "No compatible matches yet." },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
  });
});
