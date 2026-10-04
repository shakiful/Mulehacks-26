import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../../docs/fixtures/api_examples.json";
import { createMockApi } from "../api/mock";
import type { DiningMenuResponse } from "../api/types";
import { ApiProvider } from "../context/ApiContext";
import { CategoryPage } from "../pages/CategoryPage";
import { DiningMenus } from "./DiningMenus";

const sample = () => structuredClone(fixtures.dining_menus) as DiningMenuResponse;
function setup({ category = "RESTAURANT", mockMode = false } = {}) {
  const api = createMockApi({ initialUser: fixtures.test_accounts[0], delayMs: 0 });
  const getDiningMenus = vi.fn(api.getDiningMenus).mockResolvedValue(sample());
  const rendered = render(<ApiProvider client={{ ...api, getDiningMenus }} mockMode={mockMode}>
    <MemoryRouter><CategoryPage category={category as "RESTAURANT" | "RIDE"} /></MemoryRouter>
  </ApiProvider>);
  return { ...rendered, getDiningMenus, user: userEvent.setup() };
}

describe("Food Connect dining menus", () => {
  it("loads only when clicked, shows both halls and keeps the post draft when menus open or close", async () => {
    const { user, getDiningMenus } = setup();
    expect(getDiningMenus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create a post" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Post title" }), { target: { value: "Lunch with friends" } });
    const open = screen.getByRole("button", { name: "Check dining menu" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    await user.click(open);
    const region = await screen.findByRole("region", { name: "Today’s dining menus" });
    expect(await within(region).findByRole("heading", { name: "Todd Dining Center" })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "Ellis Dining Center" })).toBeInTheDocument();
    expect(within(region).getByText("Example breakfast bowl")).toBeInTheDocument();
    expect(within(region).getByText("Example vegetable pasta")).toBeInTheDocument();
    expect(within(region).getByText(/Sunday, October 4, 2026 · Central time/)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Open Todd on Sodexo" })).toHaveAttribute("href", fixtures.dining_menus.halls[0].source_url);
    expect(screen.getByRole("textbox", { name: "Post title" })).toHaveValue("Lunch with friends");
    await user.click(screen.getByRole("button", { name: "Hide dining menu" }));
    expect(screen.queryByRole("region", { name: "Today’s dining menus" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Post title" })).toHaveValue("Lunch with friends");
    expect(getDiningMenus).toHaveBeenCalledTimes(1);
  });

  it("shows independent empty/unavailable halls and recovers on retry", async () => {
    const { user, getDiningMenus } = setup();
    const result = sample();
    result.halls[0] = { ...result.halls[0], status: "EMPTY", meals: [], message: "No menu published for this day." };
    result.halls[1] = { ...result.halls[1], status: "UNAVAILABLE", meals: [], message: "Ellis menu could not be loaded." };
    getDiningMenus.mockResolvedValueOnce(result);
    await user.click(screen.getByRole("button", { name: "Check dining menu" }));
    expect(await screen.findByRole("heading", { name: "No menu published" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Ellis menu could not be loaded");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Example breakfast bowl")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("handles loading and network errors with official links available for both halls", async () => {
    const { user, getDiningMenus } = setup();
    let reject: (error: unknown) => void = () => {};
    getDiningMenus.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await user.click(screen.getByRole("button", { name: "Check dining menu" }));
    const region = screen.getByRole("region", { name: "Today’s dining menus" });
    expect(within(region).getByRole("status")).toHaveTextContent("Loading today’s Todd and Ellis");
    expect(screen.getByRole("button", { name: "Refresh menus" })).toBeDisabled();
    await act(async () => reject(new Error("Network unavailable")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    for (const name of ["Todd", "Ellis"]) {
      expect(screen.getByRole("link", { name: `Official ${name} menu` })).toHaveAttribute("rel", "noopener noreferrer");
    }
    await user.click(screen.getByRole("button", { name: "Refresh menus" }));
    expect(await screen.findByText("Example breakfast bowl")).toBeInTheDocument();
  });

  it("labels fixture menus and renders upstream names as text", async () => {
    const { user, getDiningMenus } = setup({ mockMode: true });
    const result = sample();
    result.halls[0].meals[0].stations[0].items = ['<img src=x onerror="alert(1)">'];
    getDiningMenus.mockResolvedValue(result);
    await user.click(screen.getByRole("button", { name: "Check dining menu" }));
    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dining menu examples" })).toBeInTheDocument();
    expect(screen.getByText(/Synthetic menu examples with a fixed date/)).toBeInTheDocument();
  });

  it("keeps dining menus exclusive to Food Connect", () => {
    const { getDiningMenus } = setup({ category: "RIDE" });
    expect(screen.queryByRole("button", { name: "Check dining menu" })).not.toBeInTheDocument();
    expect(getDiningMenus).not.toHaveBeenCalled();
  });

  it("requests a new menu date at midnight in Central time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T04:59:30Z"));
    const api = createMockApi({ initialUser: fixtures.test_accounts[0], delayMs: 0 });
    const getDiningMenus = vi.fn().mockResolvedValue(sample());
    const mounted = render(<ApiProvider client={{ ...api, getDiningMenus }}><DiningMenus /></ApiProvider>);
    try {
      await act(async () => {});
      expect(getDiningMenus).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(getDiningMenus).toHaveBeenCalledTimes(2);
    } finally {
      mounted.unmount();
      vi.useRealTimers();
    }
  });
});
