import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ApiProvider } from "./context/ApiContext";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { CategoryPage } from "./pages/CategoryPage";
import StudyPage from "./pages/StudyPage";
import SecurityPage from "./pages/SecurityPage";
import { MatchesPage } from "./pages/MatchesPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { MyPostsPage } from "./pages/MyPostsPage";
import { EditPostPage } from "./pages/EditPostPage";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./components/RequireAuth";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="ride"
          element={<CategoryPage key="ride" category="RIDE" />}
        />
        <Route path="study" element={<StudyPage />} />
        <Route
          path="food"
          element={<CategoryPage key="food" category="RESTAURANT" />}
        />
        <Route
          path="community"
          element={<CategoryPage key="community" category="COMMUNITY" />}
        />
        <Route path="security" element={<SecurityPage />} />
        <Route path="my-posts" element={<MyPostsPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="posts/:id/matches" element={<MatchesPage />} />
        <Route path="posts/:id/edit" element={<EditPostPage />} />
        <Route
          path="*"
          element={
            <div className="form-panel">
              <h1 className="text-2xl font-semibold">
                That page is off the campus map.
              </h1>
              <Link className="button-primary mt-5" to="/">
                Back to dashboard
              </Link>
            </div>
          }
        />
      </Route>
      </Route>
    </Routes>
  );
}
export default function App() {
  return (
    <ApiProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ApiProvider>
  );
}
