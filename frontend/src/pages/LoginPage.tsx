import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, CarFront, Eye, EyeOff, HeartHandshake } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useApi } from "../context/ApiContext";
import { Field } from "../components/Field";
import { ErrorState, LoadingState } from "../components/States";

export function LoginPage() {
  const { user, signIn, authLoading, authError, reloadSession, isMock } = useApi();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const from = location.state?.from;
  const destination = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && from !== "/login" ? from : "/";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(null);
    try { await signIn(username.trim(), password); setPassword(""); }
    catch (error) { setError(error); }
    finally { setPending(false); }
  }
  if (authLoading) return <div className="auth-state"><LoadingState label="Checking your session…" /></div>;
  if (user) return <Navigate to={destination} replace />;
  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark"><img src="/brand/ucm-mule.png" alt="University of Central Missouri mule" width={40} height={40} /></span>
          <span className="brand-name">MuleCampusBuddy</span>
        </div>
        <p className="sidebar-label">One Campus- Every Connection!</p>
        <div className="login-intro">
          <p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p>
          <h1>Every connection<br />starts with you.</h1>
          <p>A shared ride. A study partner. A little help along the way.</p>
          <div className="login-icons" aria-hidden="true"><CarFront /><BookOpen /><HeartHandshake /></div>
        </div>
        <p className="login-story-footer">Small asks. Shared possibilities.</p>
      </section>
      <section className="login-content" aria-label="Student sign in">
        <div className="login-card">
          <p className="eyebrow">WELCOME TO YOUR CAMPUS COMMUNITY</p>
          <h2>Welcome back.</h2>
          <p className="login-description">Sign in to find your next connection.</p>
          {isMock && <p className="notice mt-5">Fixture mode uses synthetic accounts and in-memory data.</p>}
          {authError !== null && <div className="mt-5"><ErrorState error={authError} retry={reloadSession} /></div>}
          {error !== null && <div className="mt-5"><ErrorState error={error} /></div>}
          <form className="mt-7" onSubmit={submit}>
            <fieldset disabled={pending} className="grid gap-5">
              <Field label="Username">
                {(props) => <input {...props} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  required maxLength={80} placeholder="Your student username" value={username}
                  onChange={(event) => setUsername(event.target.value)} />}
              </Field>
              <Field label="Password">
                {(props) => <div className="password-input"><input {...props} name="password" type={showPassword ? "text" : "password"}
                  autoComplete="current-password" required maxLength={256} value={password}
                  onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>}
              </Field>
              <button className="button-primary login-submit" type="submit">{pending ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
            </fieldset>
          </form>
        </div>
        <p className="login-footer">MuleCampusBuddy · University of Central Missouri</p>
      </section>
    </main>
  );
}
