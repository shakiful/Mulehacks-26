import { useId } from "react";
import { formatCampusDateTime, resolveDateTime, type DateTimeDraft } from "../lib/dateTime";
import { Field } from "./Field";

export function DateTimeFields({ label, value, onChange, error, required = false }: {
  label: "Start" | "End";
  value: DateTimeDraft;
  onChange: (value: DateTimeDraft) => void;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const resolution = resolveDateTime(value);
  const optional = required ? "" : " (optional)";
  return (
    <div className="md:col-span-2" role="group" aria-label={`${label} date and time`}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={`${label} date${optional}`}>
          {(props) => <input {...props} type="date" required={required} value={value.date}
            aria-invalid={Boolean(error)} aria-describedby={id}
            onChange={(event) => onChange({ date: event.target.value, time: value.time })} />}
        </Field>
        <Field label={`${label} time${optional}`}>
          {(props) => <input {...props} type="time" step={60} required={required} value={value.time}
            aria-invalid={Boolean(error)} aria-describedby={id}
            onChange={(event) => onChange({ date: value.date, time: event.target.value })} />}
        </Field>
      </div>
      {resolution.choices.length > 0 && (
        <div className="mt-3">
          <Field label={`${label} time occurrence`}>
            {(props) => <select {...props} value={value.selectedTimestamp ?? ""}
              onChange={(event) => onChange({ ...value, selectedTimestamp: event.target.value })}>
              <option value="">Choose the first or second occurrence</option>
              {resolution.choices.map((choice) => <option key={choice.timestamp} value={choice.timestamp}>{choice.label}</option>)}
            </select>}
          </Field>
        </div>
      )}
      <div id={id} className="mt-2">
        <p className="field-hint">UCM campus time · Central Time (America/Chicago)</p>
        {resolution.timestamp && <p className="mt-1 text-xs text-stone-600">{formatCampusDateTime(resolution.timestamp)}</p>}
        {(error || resolution.choices.length > 0 && resolution.error) && (
          <p className="field-error mt-1">{error || resolution.error}</p>
        )}
      </div>
      {!required && (value.date || value.time) && (
        <button className="text-button mt-2" type="button" onClick={() => onChange({ date: "", time: "" })}>
          Clear {label.toLowerCase()} date and time
        </button>
      )}
    </div>
  );
}
