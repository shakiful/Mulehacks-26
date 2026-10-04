import { useEffect, useRef, useState } from 'react';
import { hasPlaceSearch, resolveRidePlace, type NamedPlace } from '../lib/places';

export type RidePointField = 'origin_point' | 'destination_point';

function Location({ field, hint, disabled, onResolved }: {
  field: RidePointField; hint: string; disabled: boolean;
  onResolved: (field: RidePointField, hint: string, place: NamedPlace) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<NamedPlace[]>([]);
  const [message, setMessage] = useState('');
  const [attempt, retry] = useState(0);
  const latest = useRef({ hint, disabled, onResolved });
  latest.current = { hint, disabled, onResolved };
  const label = field === 'origin_point' ? 'From' : 'To';

  useEffect(() => {
    if (disabled) return;
    const request = new AbortController();
    setBusy(true); setCandidates([]); setMessage('');
    void resolveRidePlace(hint, request.signal).then(({ place, candidates }) => {
      if (request.signal.aborted || latest.current.disabled || latest.current.hint !== hint) return;
      if (place) latest.current.onResolved(field, hint, place);
      else {
        setCandidates(candidates);
        setMessage(candidates.length ? `Choose the ${label} location you meant by “${hint}”.`
          : `We couldn't locate “${hint}”. Add a street/place name and city, or choose its map point.`);
      }
    }).catch(() => {
      if (!request.signal.aborted) setMessage(`Couldn't find ${label} on the map. Retry, search or select a point manually.`);
    }).finally(() => { if (!request.signal.aborted) setBusy(false); });
    return () => request.abort();
  }, [field, hint, disabled, attempt]);

  return <div className="mt-2">
    {busy && <p role="status">Finding {label} on the map…</p>}
    {!busy && message && <>
      <p>{message}</p>
      <ul className="mt-2 divide-y divide-stone-200" aria-label={`${label} location choices`}>
        {candidates.map((place) => <li key={place.id}><button type="button" className="text-button py-2 text-left"
          disabled={disabled} onClick={() => latest.current.onResolved(field, hint, place)}>
          Use {place.label} for {label}
        </button></li>)}
      </ul>
      <button type="button" className="text-button mt-2" disabled={disabled} onClick={() => retry((value) => value + 1)}>Retry {label} lookup</button>
    </>}
  </div>;
}

export function RideLocationAutofill({ originHint, destinationHint, disabled = false, onResolved }: {
  originHint: string | null; destinationHint: string | null; disabled?: boolean;
  onResolved: (field: RidePointField, hint: string, place: NamedPlace) => void;
}) {
  if (!originHint && !destinationHint) return null;
  if (!hasPlaceSearch()) return <p className="notice" role="status">Automatic map locations are unavailable. Select From and To on the map.</p>;
  return <section className="notice mb-3" aria-label="Locations from your sentence">
    <p>Finding the places in your sentence. UCM and an unspecified Walmart use Warrensburg. Review the names and pins before posting.</p>
    {originHint && <Location field="origin_point" hint={originHint} disabled={disabled} onResolved={onResolved} />}
    {destinationHint && <Location field="destination_point" hint={destinationHint} disabled={disabled} onResolved={onResolved} />}
  </section>;
}
