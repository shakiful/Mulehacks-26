import { useState } from "react";
import {
  BookOpen,
  CarFront,
  LogOut,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  ListChecks,
  Utensils,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApi } from "../context/ApiContext";
import type { MockScenario } from "../api/mock";
import { ErrorState } from "./States";
import { NotificationBell } from "./NotificationBell";

const navigation = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ride", label: "Ride Connect", icon: CarFront },
  { to: "/study", label: "Study Connect", icon: BookOpen },
  { to: "/food", label: "Food Connect", icon: Utensils },
  { to: "/community", label: "Community", icon: HeartHandshake },
];
export function Layout() {
  const { user, userId, signOut, isMock, scenario, setScenario } = useApi();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  async function logout() {
    setLoggingOut(true); setLogoutError(null);
    try { await signOut(); navigate("/login", { replace: true, state: null }); }
    catch (error) { setLogoutError(error); }
    finally { setLoggingOut(false); }
  }
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <img
              src="/brand/ucm-mule.png"
              alt="University of Central Missouri mule"
              width={40}
              height={40}
            />
          </span>
          <span className="brand-name">MuleCampusBuddy</span>
        </NavLink>
        <p className="sidebar-label">One Campus- Every Connection!</p>
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
          <div className="api-note">
            <span className="status-dot" />
            <span>{isMock ? "Fixture mode" : "Signed in"}</span>
            <p>
              A shared campus.
              <br />
              A new connection waiting.
            </p>
          </div>
          {isMock && (
            <div className="fixture-controls">
              <label htmlFor="mock-scenario">Response states</label>
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
              <p>Reload resets the in-memory fixtures.</p>
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
            Campus commons <span>/</span> MuleCampusBuddy
          </span>
          <div className="profile-selector">
            <NotificationBell key={`${userId}:${scenario}`} />
            <span className="avatar">{user?.name.charAt(0) ?? "?"}</span>
            <div className="account-name"><span>Signed in as</span><strong>{user?.name}</strong></div>
            <button className="button-secondary logout-button" disabled={loggingOut} onClick={logout}>
              <LogOut size={15} />{loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="main-content">
          {logoutError !== null && <div className="mb-5"><ErrorState error={logoutError} /></div>}
          <div key={`${userId}:${scenario}`}><Outlet /></div>
        </main>
        <footer className="footer">
          <span>MuleCampusBuddy · MuleHacks 2026</span>
          <span>Small asks. Shared possibilities.</span>
        </footer>
      </div>
    </div>
  );
}
