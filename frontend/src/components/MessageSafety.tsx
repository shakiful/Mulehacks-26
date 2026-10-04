import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { Message, SecurityResult } from "../api/types";
import { useApi } from "../context/ApiContext";
import { Field } from "./Field";
import { ErrorState } from "./States";

export function MessageSafety({ message }: { message: Message }) {
  const { api, userId, isMock } = useApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SecurityResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const automatic = message.security;

  function close() {
    generation.current += 1;
    setOpen(false); setText(""); setPending(false); setResult(null); setError(null);
  }
  useEffect(() => {
    close();
    return () => { generation.current += 1; };
  }, [api, userId, message.id, message.text]);

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !text.trim()) return;
    const token = ++generation.current;
    setPending(true); setResult(null); setError(null);
    try {
      const assessment = await api.analyzeSecurity(text.trim());
      if (token === generation.current) setResult(assessment);
    } catch (failure) {
      if (token === generation.current) setError(failure);
    } finally {
      if (token === generation.current) setPending(false);
    }
  }

  return <div className="mt-3 border-t border-stone-200 pt-3 text-sm">
    {automatic && automatic.risk_level !== "LOW" && <aside aria-label="Message security warning"
      className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
      <p className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} /> Possible phishing · {automatic.risk_level.toLowerCase()} risk</p>
      <p className="mt-1">{automatic.summary}</p>
      <p className="mt-2 text-xs">{isMock ? "Canned fixture example; this message was not assessed." : "Automatic private check · local rules (heuristic)"}</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">Warning signs and advice</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{automatic.reasons.map((reason) => <li key={reason.code}>{reason.description}</li>)}</ul>
        <p className="mt-2">{automatic.recommendation}</p>
        <p className="mt-2 text-xs">{automatic.limitations}</p>
      </details>
    </aside>}
    {!automatic && <p className="mb-2 text-amber-900">Automatic check unavailable. Refresh after updating the backend.</p>}
    {!open ? <button type="button" className="text-button" aria-label={`Review message ${message.id} with AI`}
      onClick={() => { setText(message.text); setOpen(true); }}>Review with AI</button>
      : <section aria-label={`AI review for message ${message.id}`} className="space-y-3">
        <h3 className="font-semibold">Review this message with AI</h3>
        <p className="text-xs text-stone-600">{isMock
          ? "Mock mode returns a canned example; it does not analyze this message or contact Gemini."
          : "Only the text below will be sent to Gemini when online analysis is configured. Remove passwords, codes and personal details first. Google's data policies apply. No submitted link will be visited."}</p>
        <form className="space-y-3" onSubmit={analyze}>
          <Field label="Text to check" hint="Edit or remove private details before submitting.">
            {(props) => <textarea {...props} rows={3} maxLength={2000} required autoComplete="off" spellCheck={false}
              disabled={pending} value={text} onChange={(event) => { setText(event.target.value); setResult(null); setError(null); }} />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="button-secondary" disabled={pending || !text.trim()}>{pending ? "Checking…" : "Analyze selected text"}</button>
            <button type="button" className="text-button" onClick={close}>Close AI check</button>
          </div>
        </form>
        {error !== null && <ErrorState error={error} />}
        {result && <div aria-label="AI message assessment" aria-live="polite" className="rounded-xl border border-stone-300 bg-white p-3">
          <p className="font-semibold">{result.risk_level} risk assessment</p>
          <p className="mt-1">{result.summary}</p>
          <p className="mt-2 text-xs">Analysis mode: {result.analysis_mode.toLowerCase()}{isMock ? " · canned fixture" : ""}</p>
          {result.analysis_mode === "HEURISTIC" && !isMock && <p className="mt-1 text-xs">A rule-based assessment was returned; Gemini was not used for this result.</p>}
          <ul className="mt-2 list-disc space-y-1 pl-5">{result.reasons.map((reason) => <li key={reason.code}>{reason.description}</li>)}</ul>
          <p className="mt-2">{result.recommendation}</p>
          <p className="mt-2 text-xs">{result.limitations}</p>
        </div>}
      </section>}
  </div>;
}
