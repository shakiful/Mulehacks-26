import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import type { SecurityResult } from "../api/types";
import { ApiError } from "../api/errors";
import { useApi } from "../context/ApiContext";
import { Field } from "../components/Field";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export default function SecurityPage() {
  const { api, userId, isMock } = useApi();
  const [text, setText] = useState("");
  const [result, setResult] = useState<SecurityResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState<string>();
  const generation = useRef(0);

  function clear() {
    generation.current += 1;
    setText("");
    setResult(null);
    setPending(false);
    setError(null);
    setFieldError(undefined);
  }
  useEffect(() => {
    // Private drafts belong only to this mounted page and signed-in student.
    clear();
    return () => { generation.current += 1; };
  }, [userId]);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = text.trim();
    setError(null);
    setResult(null);
    if (!value || value.length > 8000) {
      setFieldError("Enter between 1 and 8,000 characters.");
      return;
    }
    setFieldError(undefined);
    setPending(true);
    const current = ++generation.current;
    try {
      const assessment = await api.analyzeSecurity(value);
      if (current === generation.current) setResult(assessment);
    } catch (failure) {
      if (current === generation.current) {
        setError(failure);
        if (failure instanceof ApiError)
          setFieldError(failure.details.find((item) => item.field === "text")?.message);
      }
    } finally {
      if (current === generation.current) setPending(false);
    }
  }
  const riskStyles = {
    HIGH: "border-orange-200 bg-orange-50 text-orange-900",
    MEDIUM: "border-amber-200 bg-amber-50 text-amber-900",
    LOW: "border-stone-200 bg-stone-50 text-stone-800",
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PAUSE. CHECK. PROTECT.</p>
          <h1>A little clarity,<br />before you click.</h1>
          <p>Private, text-based risk assessment for suspicious messages.</p>
        </div>
        <span className="small-icon"><ShieldCheck size={24} /></span>
      </div>
      <div className="max-w-3xl space-y-6">
        <form className="form-panel" onSubmit={analyze} noValidate>
          <h2 className="text-xl font-semibold">Check a suspicious message</h2>
          <p className="notice mt-4">
            MuleCampusBuddy does not save or publish your text or results, and never visits pasted links.
            {isMock ? " Mock mode returns a canned example; it does not assess your message." :
              " Online analysis sends the text to Gemini; Google's data policies apply. Remove passwords, codes and identifying details before submitting."}
          </p>
          <div className="mt-5">
            <Field label="Message or URL text" error={fieldError} hint="Paste text only, up to 8,000 characters. A LOW result does not mean safe.">
              {(props) => <textarea {...props} rows={6} maxLength={8000} value={text} disabled={pending}
                autoComplete="off" spellCheck={false} onChange={(event) => {
                  setText(event.target.value); setResult(null); setError(null); setFieldError(undefined);
                }} />}
            </Field>
          </div>
          <p className="mt-2 text-xs text-stone-500">{text.length.toLocaleString()} / 8,000 characters</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="button-primary" type="submit" disabled={pending || userId === null}>
              {pending ? "Assessing message…" : "Assess risk"}
            </button>
            <button className="button-secondary" type="button" onClick={clear} disabled={pending || (!text && !result && !error)}>
              Clear analysis
            </button>
          </div>
        </form>
        {pending && <LoadingState label="Assessing text and URL structure…" />}
        {error !== null && <ErrorState error={error} />}
        {!pending && !result && !error && <EmptyState title="Ready when you are." description="Paste a message to review its warning signs. No public post will be created." />}
        {result && <section aria-label="Security assessment" aria-live="polite" className="form-panel">
          <div className={`rounded-xl border p-4 ${riskStyles[result.risk_level]}`}>
            <h2 className="text-xl font-semibold">{result.risk_level} risk</h2>
            <p className="mt-2">{result.summary}</p>
          </div>
          <p className="mt-4 text-sm text-stone-500">Analysis mode: {result.analysis_mode.toLowerCase()}</p>
          <h3 className="mt-5 font-semibold">Observed warning signs</h3>
          {result.reasons.length ? <ul className="mt-3 space-y-3">
            {result.reasons.map((reason) => <li key={reason.code} className="rounded-lg border border-stone-100 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{reason.code.replaceAll("_", " ")}</p>
              <p className="mt-1 text-sm">{reason.description}</p>
            </li>)}
          </ul> : <p className="mt-2 text-sm text-stone-500">No supported warning signs were detected. Verify independently before acting.</p>}
          <h3 className="mt-5 font-semibold">What to do next</h3>
          <p className="mt-2 text-sm leading-relaxed">{result.recommendation}</p>
          <p className="notice mt-5">{result.limitations}</p>
        </section>}
      </div>
    </>
  );
}
