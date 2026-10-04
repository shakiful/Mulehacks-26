import { useEffect } from "react";
import {
  BookOpen,
  CarFront,
  ChevronDown,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  ListChecks,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import type { MockScenario } from "../api/mock";
import { ErrorState, LoadingState } from "./States";

const navigation = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ride", label: "Ride Connect", icon: CarFront },
  { to: "/study", label: "Study Connect", icon: BookOpen },
  { to: "/food", label: "Food Connect", icon: Utensils },
  { to: "/community", label: "Community", icon: HeartHandshake },
  { to: "/security", label: "Security", icon: ShieldCheck },
];
export function Layout() {
  const { api, userId, setUserId, isMock, scenario, setScenario } = useApi();
  const profiles = useResource(() => api.listDemoUsers(), [api]);
  useEffect(() => {
    if (userId === null && profiles.data?.items.length)
      setUserId(profiles.data.items[0].id);
  }, [userId, profiles.data]);
  const selected = profiles.data?.items.find(
    (profile) => profile.id === userId,
  );
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <Link2 size={23} strokeWidth={2.3} />
          </span>
          connect<span>hub</span>
          <span className="brand-dot">.</span>
        </NavLink>
        <p className="sidebar-label">A LITTLE MORE TOGETHER</p>
        <nav aria-label="Main navigation" className="nav-list">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              end={to === "/"}
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
            </NavLink>
          ))}
          <span className="nav-divider" />
          <NavLink
            to="/my-posts"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <ListChecks size={19} />
            My posts
          </NavLink>
          <NavLink
            to="/connections"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Link2 size={19} />
            Connections
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="status-dot" />
            <span>{isMock ? "Mock demo" : "Live API demo"}</span>
            <p>
              Demo profiles are synthetic.
              <br />
              Local prototype identity.
            </p>
          </div>
          {isMock && (
            <div className="demo-controls">
              <label htmlFor="mock-scenario">Demo responses</label>
              <select
                id="mock-scenario"
                value={scenario}
                onChange={(event) =>
                  setScenario(event.target.value as MockScenario)
                }
              >
                <option value="normal">Normal</option>
                <option value="empty">Empty</option>
                <option value="error">Error</option>
              </select>
              <p>Reload resets the in-memory demo.</p>
            </div>
          )}
          <p className="sidebar-footnote">
            Built for the things
            <br />
            that bring us together.
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-breadcrumb">
            Campus commons <span>/</span> ConnectHub
          </span>
          <div className="profile-selector">
            <span className="avatar">{selected?.name.charAt(0) ?? "?"}</span>
            <div>
              <label htmlFor="demo-profile">Demo profile</label>
              <div className="relative">
                <select
                  id="demo-profile"
                  disabled={profiles.loading || !profiles.data?.items.length}
                  value={userId ?? ""}
                  onChange={(event) => setUserId(Number(event.target.value))}
                >
                  {!selected && <option value="">Choose a profile</option>}
                  {profiles.data?.items.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-0 top-2"
                />
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="main-content">
          {profiles.loading ? (
            <LoadingState label="Loading demo profiles…" />
          ) : profiles.error ? (
            <ErrorState error={profiles.error} retry={profiles.reload} />
          ) : !profiles.data?.items.length ? (
            <ErrorState
              error={
                new Error(
                  "No demo profiles available. Seed the backend and retry.",
                )
              }
              retry={profiles.reload}
            />
          ) : userId === null ? (
            <LoadingState label="Selecting a demo profile…" />
          ) : (
            <div key={`${userId}:${scenario}`}>
              <Outlet />
            </div>
          )}
        </main>
        <footer className="footer">
          <span>ConnectHub · MuleHacks 2026</span>
          <span>Small asks. Shared possibilities.</span>
        </footer>
      </div>
    </div>
  );
}
