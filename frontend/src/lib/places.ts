import type { GeoPoint } from '../api/types';

export interface NamedPlace { id: string; label: string; point: GeoPoint }
export const hasPlaceSearch = () => Boolean(import.meta.env.VITE_MAPTILER_API_KEY?.trim());
const unavailable = 'Place lookup is unavailable. Select a map point and type its street or place name.';

function readPlaces(value: unknown): NamedPlace[] {
  if (!value || typeof value !== 'object' || !('features' in value) || !Array.isArray(value.features))
    throw new Error('Place lookup returned an unreadable response. Please try again.');
  return value.features.slice(0, 10).flatMap((feature: unknown, index: number) => {
    if (!feature || typeof feature !== 'object') return [];
    const f = feature as Record<string, unknown>;
    const geometry = f.geometry as { type?: string; coordinates?: unknown } | undefined;
    const center = Array.isArray(f.center) ? f.center : geometry?.type === 'Point' ? geometry.coordinates : null;
    const label = typeof f.place_name === 'string' ? f.place_name.trim()
      : typeof f.text === 'string' ? f.text.trim() : '';
    if (!label || !Array.isArray(center) || center.length !== 2) return [];
    const [lng, lat] = center;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    return [{ id: typeof f.id === 'string' ? f.id : `place-${index}`, label: label.slice(0, 300), point: { lat, lng } }];
  });
}

async function lookup(query: string, params: Record<string, string>, signal: AbortSignal): Promise<NamedPlace[]> {
  const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim();
  if (!key) throw new Error(unavailable);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 8000);
  try {
    const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
    url.search = new URLSearchParams({ ...params, language: 'en', key }).toString();
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error(unavailable);
    return readPlaces(await response.json());
  } catch {
    // Neither a provider payload nor a request URL/key belongs in the interface or logs.
    if (signal.aborted) throw new DOMException('Lookup cancelled', 'AbortError');
    throw new Error(unavailable);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export async function searchPlaces(query: string, near: GeoPoint, signal: AbortSignal): Promise<NamedPlace[]> {
  const text = query.trim();
  if (text.length < 2 || text.length > 200) throw new Error('Enter a place name or address between 2 and 200 characters.');
  // POIs are excluded by MapTiler's defaults; include businesses and campus places explicitly.
  return lookup(text, { types: 'poi,address,road,place,municipality', limit: '5', autocomplete: 'false', proximity: `${near.lng},${near.lat}` }, signal);
}

export async function reversePlace(point: GeoPoint, signal: AbortSignal): Promise<string | null> {
  const places = await lookup(`${point.lng},${point.lat}`, { types: 'poi,address,road' }, signal);
  return places[0]?.label ?? null;
}
