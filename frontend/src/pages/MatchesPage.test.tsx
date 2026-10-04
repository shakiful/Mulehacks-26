import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "../api/mock";
import type { ApiClient } from "../api/types";
import { ApiProvider } from "../context/ApiContext";
import { RequireAuth } from "../components/RequireAuth";
import { ConnectionsPage } from "./ConnectionsPage";
import { MatchesPage } from "./MatchesPage";

function renderMatches(api: ApiClient, postId = 51) {
  render(
    <ApiProvider client={api} mockMode>
      <MemoryRouter initialEntries={[`/posts/${postId}/matches`]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/posts/:id/matches" element={<MatchesPage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
}

async function signIn(api: ApiClient, username: string) {
  await api.logout();
  await api.login(username, "fixture-only");
}

describe("existing connections on ride matches", () => {
  it("recognizes an incoming request in reverse post order and opens the inbox without duplicating it", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ initialUser: { id: 2, name: "Afsana", username: "afsana" }, delayMs: 0 });
    await api.createConnection(52, 51);
    await signIn(api, "rafi");
    const create = vi.spyOn(api, "createConnection");
    renderMatches(api);

    const respond = await screen.findByRole("link", { name: "Respond to request" });
    expect(respond).toHaveAttribute("href", "/connections");
    expect(screen.queryByRole("button", { name: "Request connection" })).not.toBeInTheDocument();
    await user.click(respond);
    expect(await screen.findByRole("heading", { name: "Request from Afsana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(create).not.toHaveBeenCalled();
    expect((await api.listConnections()).items).toHaveLength(1);
  });

  it("keeps an outgoing pending request disabled on a fresh matches page", async () => {
    const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
    await api.createConnection(51, 52);
    const create = vi.spyOn(api, "createConnection");
    renderMatches(api);
    expect(await screen.findByRole("button", { name: "Request sent" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Respond to request" })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("opens messaging for an accepted connection in reverse post order", async () => {
    const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
    const connection = await api.createConnection(42, 7);
    // Study fixtures script one direction; the live API also returns the reverse pair.
    vi.spyOn(api, "listConnections").mockResolvedValue({ items: [{
      ...connection, status: "ACCEPTED", source_post_id: 7, target_post_id: 42,
      requester_id: 2, receiver_id: 1,
    }] });
    const create = vi.spyOn(api, "createConnection");
    renderMatches(api, 42);
    expect(await screen.findByRole("link", { name: "Message" })).toHaveAttribute("href", `/messages/connection/${connection.id}`);
    expect(screen.queryByRole("button", { name: "Request connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Respond to request" })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["DECLINED", "CANCELLED"] as const)("allows a new request after the earlier pair is %s", async (status) => {
    const user = userEvent.setup();
    const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
    const connection = await api.createConnection(51, 52);
    if (status === "DECLINED") await signIn(api, "afsana");
    await api.updateConnection(connection.id, status);
    if (status === "DECLINED") await signIn(api, "rafi");
    renderMatches(api);
    const request = await screen.findByRole("button", { name: "Request connection" });
    expect(request).toBeEnabled();
    await user.click(request);
    expect(await screen.findByRole("button", { name: "Request sent" })).toBeDisabled();
    const connections = (await api.listConnections()).items;
    expect(connections).toHaveLength(2);
    expect(connections.filter((item) => item.status === "PENDING")).toHaveLength(1);
  });
});
