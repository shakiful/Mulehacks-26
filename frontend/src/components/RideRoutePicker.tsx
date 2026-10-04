import { useEffect, useRef, useState } from "react";
import { Map as LibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoPoint } from "../api/types";
import { mapStyles } from "../lib/mapStyles";

setWorkerUrl(workerUrl);
type PointField = "origin_point" | "destination_point";
const campus: GeoPoint = { lat: 38.7625, lng: -93.7395 };

export default function RideRoutePicker({ origin, destination, onSelect, disabled = false, errors = [] }: {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  onSelect: (field: PointField, point: GeoPoint) => void;
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
  const providers = useRef(mapStyles());
  const provider = providers.current[providerIndex];
  const latest = useRef({ active, onSelect, disabled });
  latest.current = { active, onSelect, disabled };
  const initial = useRef(origin ?? campus);

  function choose(point: GeoPoint) {
    const current = latest.current;
    if (current.disabled) return;
    // MapLibre permits wrapped world longitudes; store the API's canonical range.
    const lng = point.lng < -180 || point.lng > 180 ? ((point.lng + 180) % 360 + 360) % 360 - 180 : point.lng;
    current.onSelect(current.active, { ...point, lng });
    if (current.active === "origin_point") setActive("destination_point");
  }
  useEffect(() => {
    setError("");
    setReady(false);
    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: container.current!,
        style: provider.style,
        center: [initial.current.lng, initial.current.lat],
        zoom: 13, attributionControl: { compact: false },
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
      if (providerIndex + 1 < providers.current.length) setProviderIndex(providerIndex + 1);
      else setError("Map tiles could not load. Check your connection and retry.");
    };
    instance.on("error", (event) => {
      // Do not print provider payloads or disable a working map for a single tile.
      const status = (event.error as Error & { status?: number }).status;
      if (!instance.isStyleLoaded() || status === 401 || status === 403 || status === 429) failed();
    });
    instance.on("click", (event) => choose({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    const timer = window.setTimeout(() => {
      if (!instance.isStyleLoaded()) failed();
    }, 20000);
    return () => {
      window.clearTimeout(timer);
      const center = instance.getCenter();
      initial.current = { lat: center.lat, lng: center.lng };
      instance.remove();
      map.current = null;
    };
  }, [attempt, providerIndex]);

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
    <p className="mt-1 text-sm text-stone-500">Required for requests and offers. Select a point to place, then click the map. You can also pan with the arrow keys and choose its center. The initial campus view is not your selected location.</p>
    <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Point to place">
      <button type="button" className={active === "origin_point" ? "button-primary" : "button-secondary"}
        aria-pressed={active === "origin_point"} disabled={disabled} onClick={() => setActive("origin_point")}>A · From</button>
      <button type="button" className={active === "destination_point" ? "button-primary" : "button-secondary"}
        aria-pressed={active === "destination_point"} disabled={disabled} onClick={() => setActive("destination_point")}>B · To</button>
      <button type="button" className="button-secondary" disabled={disabled || !ready}
        onClick={() => { const center = map.current!.getCenter(); choose({ lat: center.lat, lng: center.lng }); }}>
        Choose map center for {active === "origin_point" ? "From" : "To"}
      </button>
    </div>
    <div ref={container} className="h-80 w-full overflow-hidden rounded-lg" />
    {!ready && !error && <p role="status" className="mt-2 text-sm">Loading {provider.name}…</p>}
    {providerIndex > 0 && <p role="status" className="mt-2 text-sm">MapTiler could not load. Using OpenFreeMap.</p>}
    {error && <div role="alert" className="error-panel mt-3">{error}
      <button type="button" className="text-button ml-2" disabled={disabled} onClick={() => { setProviderIndex(0); setAttempt((value) => value + 1); }}>Retry map</button>
    </div>}
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2" aria-live="polite">
      <p>From: {origin ? `${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)}` : "Choose a pickup point"}</p>
      <p>To: {destination ? `${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}` : "Choose a destination point"}</p>
    </div>
    {errors.map((message) => <p key={message} role="alert" className="mt-2 text-sm text-red-700">{message}</p>)}
    <p className="mt-3 text-xs text-stone-500">Matching compares pickup and destination pins within 5 km each, using straight-line distance. Confirm the actual route with the other person. These selected locations will be public in the local demo.</p>
  </section>;
}
