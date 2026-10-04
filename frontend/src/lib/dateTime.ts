export const CAMPUS_TIME_ZONE = "America/Chicago";

export interface DateTimeDraft {
  date: string;
  time: string;
  original?: string;
  selectedTimestamp?: string;
}

interface TimeChoice {
  timestamp: string;
  label: string;
}

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const readable = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric", month: "long", day: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
});
const shortTime = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
});

function campusParts(instant: number) {
  const parts = Object.fromEntries(clock.formatToParts(instant).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    seconds: parts.second,
  };
}

export function fromTimestamp(timestamp?: string | null): DateTimeDraft {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return { date: "", time: "" };
  const { date, time } = campusParts(Date.parse(timestamp));
  return { date, time, original: timestamp };
}

export function formatCampusDateTime(timestamp: string) {
  return readable.format(new Date(timestamp));
}

export function resolveDateTime(draft: DateTimeDraft): {
  timestamp: string | null;
  error: string | null;
  choices: TimeChoice[];
} {
  const result = (timestamp: string | null, error: string | null = null, choices: TimeChoice[] = []) =>
    ({ timestamp, error, choices });
  if (!draft.date && !draft.time) return result(null);
  if (!draft.date || !draft.time) return result(null, "Choose both a date and a time.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}$/.test(draft.time))
    return result(null, "Choose a valid date and time.");
  const wallClock = Date.parse(`${draft.date}T${draft.time}:00Z`);
  if (!Number.isFinite(wallClock) || new Date(wallClock).toISOString().slice(0, 16) !== `${draft.date}T${draft.time}`)
    return result(null, "Choose a valid date and time.");

  // An unchanged saved/AI timestamp already identifies an exact instant, even
  // during the repeated autumn hour. Preserve its seconds and UTC offset.
  if (draft.original) {
    const original = fromTimestamp(draft.original);
    if (original.date === draft.date && original.time === draft.time) return result(draft.original);
  }

  // Probe both sides of a clock change, then round-trip each possible offset.
  // This keeps campus time independent of the browser's local timezone.
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = wallClock + delta;
    const parts = campusParts(probe);
    offsets.add(Date.parse(`${parts.date}T${parts.time}:${parts.seconds}Z`) - probe);
  }
  const candidates = [...offsets].map((offset) => wallClock - offset).filter((instant) => {
    const local = campusParts(instant);
    return local.date === draft.date && local.time === draft.time;
  }).sort((a, b) => a - b);
  if (!candidates.length)
    return result(null, "This time is skipped when daylight saving starts. Choose another time.");
  if (candidates.length === 1) return result(new Date(candidates[0]).toISOString());
  const choices = candidates.map((instant, index) => ({
    timestamp: new Date(instant).toISOString(),
    label: `${index === 0 ? "First" : "Second"} ${shortTime.format(instant)}`,
  }));
  if (choices.some((choice) => choice.timestamp === draft.selectedTimestamp))
    return result(draft.selectedTimestamp!, null, choices);
  return result(null, "This time occurs twice when daylight saving ends. Choose which occurrence you mean.", choices);
}
