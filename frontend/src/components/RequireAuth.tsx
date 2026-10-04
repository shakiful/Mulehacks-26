import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useApi } from "../context/ApiContext";
import { ErrorState, LoadingState } from "./States";

export function RequireAuth() {
  const { user, authLoading, authError, reloadSession } = useApi();
  const location = useLocation();
  if (authLoading) return <div className="auth-state"><LoadingState label="Checking your session…" /></div>;
  if (authError) return <div className="auth-state"><ErrorState error={authError} retry={reloadSession} /></div>;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}
