import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ApiProvider } from "./context/ApiContext";
import { AppRoutes } from "./App";

function renderApp(path = "/") {
  return render(
    <ApiProvider mockMode>
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
describe("frontend workflows", () => {
  it("shows loading, dashboard shortcuts, synthetic profiles, and empty/error recovery", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading demo profiles",
    );
    expect(
      await screen.findByRole("heading", { name: /Good things start/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Help with SQL joins" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Demo profile" })).toHaveValue(
      "1",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Demo responses" }),
      "empty",
    );
    expect(
      await screen.findByRole("heading", {
        name: "A little quiet here, for now.",
      }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Demo responses" }),
      "error",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Demo responses" }),
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
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Demo profile" }),
      "2",
    );
    await user.click(navigationLink("Connections"));
    const accept = await screen.findByRole("button", { name: "Accept" });
    expect(
      screen.getByRole("heading", { name: "Request from Rafi (demo)" }),
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
    await user.type(screen.getByRole("textbox", { name: "From" }), "UCM");
    await user.type(screen.getByRole("textbox", { name: "To" }), "Walmart");
    await user.type(
      screen.getByRole("textbox", { name: "Start date & time" }),
      "2026-10-03T18:00:00-05:00",
    );
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
    expect(screen.getByRole("textbox", { name: "From" })).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Start date & time" }),
    ).toHaveValue("");
    expect(
      screen.getByText(/Please confirm: origin, destination, starts at/),
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
