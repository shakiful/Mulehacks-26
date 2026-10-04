import { useEffect, useRef, useState } from "react";
import { Map as LibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoPoint } from "../api/types";
import { mapStyles, type MapView } from "../lib/mapStyles";
import { hasPlaceSearch, reversePlace, searchPlaces, type NamedPlace } from '../lib/places';
import { Field } from './Field';

setWorkerUrl(workerUrl);
type PointField = "origin_point" | "destination_point";
const campus: GeoPoint = { lat: 38.7625, lng: -93.7395 };

export default function RideRoutePicker({ origin, destination, originLabel = '', destinationLabel = '', onSelect, onNameResolved, disabled = false, errors = [] }: {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  originLabel?: string;
  destinationLabel?: string;
  onSelect: (field: PointField, point: GeoPoint, label: string | null) => void;
  onNameResolved?: (field: PointField, point: GeoPoint, label: string) => void;
  disabled?: boolean;
  errors?: string[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const [active, setActive] = useState<PointField>("origin_point");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [providerIndex, setProviderIndex] = useState(0);
  const [view, setView] = useState<MapView>('satellite');
  const providers = mapStyles(undefined, view);
  const provider = providers[providerIndex];
  const latest = useRef({ active, onSelect, onNameResolved, disabled, ready });
  latest.current = { active, onSelect, onNameResolved, disabled, ready };
  const initial = useRef(origin ?? campus);
  const zoom = useRef(15);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NamedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [looking, setLooking] = useState<Record<PointField, boolean>>({ origin_point: false, destination_point: false });
  const [nameErrors, setNameErrors] = useState<Record<PointField, string>>({ origin_point: '', destination_point: '' });
  const searchRequest = useRef<AbortController | null>(null);
  const nameRequests = useRef<Record<PointField, AbortController | null>>({ origin_point: null, destination_point: null });

  function clearSearch() {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setSearching(false);
    setResults([]);
    setSearchError('');
  }
  function selectField(field: PointField) {
    clearSearch();
    setQuery('');
    latest.current.active = field;
    setActive(field);
  }
  async function findName(field: PointField, point: GeoPoint) {
    nameRequests.current[field]?.abort();
    const request = new AbortController();
    nameRequests.current[field] = request;
    setLooking((current) => ({ ...current, [field]: true }));
    setNameErrors((current) => ({ ...current, [field]: '' }));
    try {
      const label = await reversePlace(point, request.signal);
      if (request.signal.aborted || nameRequests.current[field] !== request || latest.current.disabled) return;
      if (!label) throw new Error('No street or place name was found here. Search nearby or type its name in the form.');
      latest.current.onNameResolved?.(field, point, label);
    } catch (error) {
      if (!request.signal.aborted && nameRequests.current[field] === request)
        setNameErrors((current) => ({ ...current, [field]: error instanceof Error ? error.message : 'Place lookup failed. Please retry.' }));
    } finally {
      if (nameRequests.current[field] === request) setLooking((current) => ({ ...current, [field]: false }));
    }
  }
  async function search() {
    if (latest.current.disabled || searching) return;
    clearSearch();
    const request = new AbortController();
    searchRequest.current = request;
    const field = latest.current.active;
    const center = map.current?.getCenter() ?? initial.current;
    setSearching(true);
    try {
      const found = await searchPlaces(query, { lat: center.lat, lng: center.lng }, request.signal);
      if (request.signal.aborted || searchRequest.current !== request || latest.current.active !== field || latest.current.disabled) return;
      setResults(found);
      if (!found.length) setSearchError('No places found. Try a street, address or place name with its city.');
    } catch (error) {
      if (!request.signal.aborted && searchRequest.current === request)
        setSearchError(error instanceof Error ? error.message : 'Place search failed. Please retry.');
    } finally {
      if (searchRequest.current === request) setSearching(false);
    }
  }

  function choose(point: GeoPoint, label: string | null = null) {
    const current = latest.current;
    if (current.disabled) return;
    // MapLibre permits wrapped world longitudes; store the API's canonical range.
    const lng = point.lng < -180 || point.lng > 180 ? ((point.lng + 180) % 360 + 360) % 360 - 180 : point.lng;
    const field = current.active;
    const selected = { ...point, lng };
    nameRequests.current[field]?.abort();
    current.onSelect(field, selected, label);
    setNameErrors((errors) => ({ ...errors, [field]: '' }));
    setLooking((busy) => ({ ...busy, [field]: false }));
    if (!label) void findName(field, selected);
    clearSearch();
    setQuery('');
    if (field === "origin_point") selectField('destination_point');
  }
  useEffect(() => () => {
    searchRequest.current?.abort();
    Object.values(nameRequests.current).forEach((request) => request?.abort());
  }, []);
  useEffect(() => {
    if (!disabled) return;
    clearSearch();
    Object.values(nameRequests.current).forEach((request) => request?.abort());
    setLooking({ origin_point: false, destination_point: false });
  }, [disabled]);
  useEffect(() => {
    // Upgrade unnamed legacy draft pins; do not rewrite an existing named route.
    if (disabled) return;
    if (origin && !originLabel.trim() && (!nameRequests.current.origin_point || nameRequests.current.origin_point.signal.aborted)) void findName('origin_point', origin);
    if (destination && !destinationLabel.trim() && (!nameRequests.current.destination_point || nameRequests.current.destination_point.signal.aborted)) void findName('destination_point', destination);
  }, [origin, destination, originLabel, destinationLabel, disabled]);
  useEffect(() => {
    setError("");
    setReady(false);
    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: container.current!,
        style: provider.style,
        center: [initial.current.lng, initial.current.lat],
        zoom: zoom.current, attributionControl: { compact: false },
      });
    } catch {
      setError("The map could not start. Enable WebGL in your browser and retry.");
      return;
    }
    map.current = instance;
    instance.addControl(new NavigationControl(), "top-right");
    instance.getCanvas().setAttribute("aria-label", "Ride route map. Pan or zoom, then use Choose map center.");
    instance.getCanvas().style.cursor = "crosshair";
    instance.on("load", () => { setReady(true); setError(""); });
    const failed = () => {
      if (providerIndex + 1 < providers.length) setProviderIndex(providerIndex + 1);
      else setError("Map tiles could not load. Check your connection and retry.");
    };
    instance.on("error", (event) => {
      // Do not print provider payloads or disable a working map for a single tile.
      const status = (event.error as Error & { status?: number }).status;
      if (!instance.isStyleLoaded() || status === 401 || status === 403 || status === 429) failed();
    });
    instance.on("click", (event) => { if (latest.current.ready) choose({ lat: event.lngLat.lat, lng: event.lngLat.lng }); });
    const timer = window.setTimeout(() => {
      if (!instance.isStyleLoaded()) failed();
    }, 20000);
    return () => {
      window.clearTimeout(timer);
      const center = instance.getCenter();
      initial.current = { lat: center.lat, lng: center.lng };
      zoom.current = instance.getZoom();
      instance.remove();
      map.current = null;
    };
  }, [attempt, providerIndex, view]);

  useEffect(() => {
    if (!map.current || !ready) return;
    const markers = [origin, destination].flatMap((point, index) => {
      if (!point) return [];
      const element = document.createElement("div");
      element.textContent = index === 0 ? "A" : "B";
      element.setAttribute("aria-label", index === 0 ? "From point" : "To point");
      element.style.cssText = "background:#214638;color:white;border:2px solid white;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-weight:bold;box-shadow:0 1px 5px #555";
      return [new Marker({ element }).setLngLat([point.lng, point.lat]).addTo(map.current!)];
    });
    return () => { markers.forEach((marker) => marker.remove()); };
  }, [origin, destination, ready]);

  return <section className="rounded-xl border border-stone-200 p-4" aria-label="Choose ride route">
    <h3 className="font-semibold">Choose From and To on the map</h3>
    <p className="mt-1 text-sm text-stone-500">Search for a street, address or place, or click the map. Selecting a place fills From or To. Choose both locations for requests and offers.</p>
    <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Point to place">
      <button type="button" className={active === "origin_point" ? "button-primary" : "button-secondary"}
        aria-pressed={active === "origin_point"} disabled={disabled} onClick={() => selectField("origin_point")}>A · From</button>
      <button type="button" className={active === "destination_point" ? "button-primary" : "button-secondary"}
        aria-pressed={active === "destination_point"} disabled={disabled} onClick={() => selectField("destination_point")}>B · To</button>
      <button type="button" className="button-secondary" disabled={disabled || !ready}
        onClick={() => { const center = map.current!.getCenter(); choose({ lat: center.lat, lng: center.lng }); }}>
        Choose map center for {active === "origin_point" ? "From" : "To"}
      </button>
    </div>
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label={active === 'origin_point' ? 'Search for pickup place' : 'Search for destination place'}>
          {(props) => <input {...props} value={query} maxLength={200} placeholder="e.g. Walmart, Warrensburg"
            disabled={disabled || !hasPlaceSearch()} onChange={(event) => { clearSearch(); setQuery(event.target.value); }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} />}
        </Field>
      </div>
      <button type="button" className="button-primary" disabled={disabled || searching || query.trim().length < 2 || !hasPlaceSearch()}
        onClick={() => void search()}>{searching ? 'Searching…' : 'Search places'}</button>
    </div>
    {!hasPlaceSearch() && <p className="notice mb-3">Place search is unavailable. Select a point on the map and type its street or place name.</p>}
    {searchError && <p role="alert" className="error-panel mb-3">{searchError}</p>}
    {results.length > 0 && <ul className="mb-4 divide-y divide-stone-200 rounded-lg border border-stone-200" aria-label="Place search results">
      {results.map((place) => <li key={place.id}>
        <button type="button" className="w-full px-4 py-3 text-left text-sm hover:bg-stone-100" disabled={disabled}
          aria-label={`Use ${place.label} for ${active === 'origin_point' ? 'From' : 'To'}`}
          onClick={() => { map.current?.flyTo({ center: [place.point.lng, place.point.lat], zoom: 16 }); choose(place.point, place.label); }}>
          <span className="font-medium">{place.label}</span>
        </button>
      </li>)}
    </ul>}
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Map view">
      <button type="button" className={view === 'satellite' ? 'button-primary' : 'button-secondary'} aria-pressed={view === 'satellite'}
        disabled={disabled || !hasPlaceSearch()} onClick={() => { setProviderIndex(0); setView('satellite'); }}>Satellite</button>
      <button type="button" className={view === 'street' ? 'button-primary' : 'button-secondary'} aria-pressed={view === 'street'}
        disabled={disabled} onClick={() => { setProviderIndex(0); setView('street'); }}>Street map</button>
    </div>
    <div ref={container} className="h-96 w-full overflow-hidden rounded-lg" />
    {!ready && !error && <p role="status" className="mt-2 text-sm">Loading {provider.name}…</p>}
    {providerIndex > 0 && <p role="status" className="mt-2 text-sm">MapTiler could not load. Using OpenFreeMap street map.</p>}
    {error && <div role="alert" className="error-panel mt-3">{error}
      <button type="button" className="text-button ml-2" disabled={disabled} onClick={() => { setProviderIndex(0); setAttempt((value) => value + 1); }}>Retry map</button>
    </div>}
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2" aria-live="polite">
      <p>From: {looking.origin_point ? 'Finding the street or place name…' : originLabel || (origin ? 'Pickup selected — enter its name above' : 'Choose a pickup place')}</p>
      <p>To: {looking.destination_point ? 'Finding the street or place name…' : destinationLabel || (destination ? 'Destination selected — enter its name above' : 'Choose a destination place')}</p>
    </div>
    {(['origin_point', 'destination_point'] as const).map((field) => nameErrors[field] && <p key={field} role="alert" className="error-panel mt-3">
      {field === 'origin_point' ? 'From' : 'To'}: {nameErrors[field]}
      <button type="button" className="text-button ml-2" disabled={disabled || looking[field]}
        onClick={() => { const point = field === 'origin_point' ? origin : destination; if (point) void findName(field, point); }}>
        Retry {field === 'origin_point' ? 'From' : 'To'} name
      </button>
    </p>)}
    {errors.map((message) => <p key={message} role="alert" className="mt-2 text-sm text-red-700">{message}</p>)}
    <p className="mt-3 text-xs text-stone-500">Matching compares pickup and destination pins within 5 km each, using straight-line distance. Confirm the actual route with the other person. These selected locations will be public in the local demo.</p>
    <p className="mt-2 text-xs text-stone-500">Place searches and selected map points are sent to MapTiler to find names. You can pan with the arrow keys and choose the map center. The initial campus view does not select your pickup.</p>
  </section>;
}
