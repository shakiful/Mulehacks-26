import { useEffect, useId, useRef, useState } from 'react';
import type { GeoPoint } from '../api/types';
import { hasPlaceSearch, reversePlace, suggestPlaces, type NamedPlace } from '../lib/places';
import { Field } from './Field';
import { RideLocationHint, type RidePointField } from './RideLocationAutofill';

export function RidePlaceField({ field, value, point, near, autoHint, disabled = false, error,
  onEdit, onSelect, onAutoResolved, onNameResolved }: {
  field: RidePointField; value: string; point: GeoPoint | null; near: GeoPoint;
  autoHint: string | null; disabled?: boolean; error?: string;
  onEdit: (value: string) => void;
  onSelect: (place: NamedPlace) => void;
  onAutoResolved: (field: RidePointField, hint: string, place: NamedPlace) => void;
  onNameResolved: (point: GeoPoint, name: string) => void;
}) {
  const label = field === 'origin_point' ? 'From' : 'To';
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [attempt, retry] = useState(0);
  const [search, setSearch] = useState<{ query: string; places: NamedPlace[]; busy: boolean; message: string }>(
    { query: '', places: [], busy: false, message: '' });
  const latest = useRef({ value, point, disabled, onNameResolved });
  latest.current = { value, point, disabled, onNameResolved };
  const configured = hasPlaceSearch();

  useEffect(() => {
    if (!open || disabled || !configured || query !== value || query.trim().length < 3 || query.trim().length > 200) return;
    const request = new AbortController();
    const timer = window.setTimeout(() => {
      setSearch({ query, places: [], busy: true, message: '' });
      void suggestPlaces(query, { lat: near.lat, lng: near.lng }, request.signal).then((places) => {
        if (request.signal.aborted) return;
        setSearch({ query, places, busy: false, message: places.length ? '' : 'No places found. Add a street name or city and try again.' });
        setActive(-1);
      }).catch(() => {
        if (!request.signal.aborted) setSearch({ query, places: [], busy: false,
          message: 'Location search is unavailable. Retry, or show the map to choose a location.' });
      });
    }, 400);
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [query, value, open, disabled, configured, near.lat, near.lng, attempt]);

  // Old saved drafts may have a valid point with only a numeric placeholder for its name.
  useEffect(() => {
    if (!point || value || autoHint || disabled || !configured) return;
    const selected = point, request = new AbortController();
    void reversePlace(selected, request.signal).then((name) => {
      const current = latest.current;
      if (name && !request.signal.aborted && !current.disabled && !current.value
        && current.point?.lat === selected.lat && current.point?.lng === selected.lng)
        current.onNameResolved(selected, name);
    }).catch(() => { /* The field and optional map remain usable without a reverse lookup. */ });
    return () => request.abort();
  }, [point?.lat, point?.lng, value, autoHint, disabled, configured]);

  const visible = open && !disabled && query === value && query.trim().length >= 3;
  const places = visible && search.query === query ? search.places : [];
  const choose = (place: NamedPlace) => {
    setOpen(false); setQuery(''); setActive(-1);
    onSelect(place);
  };

  return <div>
    <Field label={label} error={error} hint="Type a place or street name, then choose a suggestion.">
      {(props) => <>
        <input {...props} type="text" role="combobox" autoComplete="off" maxLength={300}
          placeholder={label === 'From' ? 'Starting place or address' : 'Destination place or address'}
          value={value} disabled={disabled} aria-autocomplete="list" aria-expanded={places.length > 0}
          aria-controls={places.length ? listId : undefined}
          aria-activedescendant={active >= 0 && places[active] ? `${listId}-${active}` : undefined}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); onEdit(event.target.value); }}
          onFocus={() => { if (!point && query === value) setOpen(true); }}
          onBlur={() => { setOpen(false); setActive(-1); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (places.length) setActive((index) => event.key === 'ArrowDown' ? (index + 1) % places.length
                : index <= 0 ? places.length - 1 : index - 1);
            } else if (event.key === 'Enter') {
              // Enter chooses a highlighted location; it never publishes the enclosing post form.
              event.preventDefault();
              if (active >= 0 && places[active]) choose(places[active]);
            } else if (event.key === 'Escape') {
              event.preventDefault(); setOpen(false); setActive(-1);
            }
          }} />
        {places.length > 0 && <ul id={listId} role="listbox" aria-label={`${label} suggestions`}
          className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {places.map((place, index) => <li key={`${place.id}-${index}`}>
            <button type="button" role="option" id={`${listId}-${index}`} tabIndex={-1} aria-selected={index === active}
              className={`w-full px-3 py-3 text-left text-sm ${index === active ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
              onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(place)}>{place.label}</button>
          </li>)}
        </ul>}
      </>}
    </Field>
    {point && value && <p className="mt-1 text-xs text-emerald-700">Location selected</p>}
    {visible && configured && query.trim().length <= 200 && search.query === query && <div aria-live="polite" className="mt-2 text-sm">
      {search.busy && <p role="status">Searching {label} locations…</p>}
      {search.message && <>
        <p>{search.message}</p>
        <button type="button" className="text-button mt-1" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}
          onClick={() => retry((count) => count + 1)}>Retry {label} search</button>
      </>}
    </div>}
    {visible && query.trim().length > 200 && <p className="field-hint">Use up to 200 characters to search.</p>}
    {!configured && !point && <p className="field-hint">Location suggestions are unavailable. Show the map to choose a location.</p>}
    {configured && autoHint && !disabled && <RideLocationHint field={field} hint={autoHint} disabled={disabled} onResolved={onAutoResolved} />}
  </div>;
}
