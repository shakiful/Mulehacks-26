import type { GeoPoint } from '../api/types';
import { distanceMiles, UCM_CAMPUS } from './geo';

export interface NamedPlace {
  id: string; label: string; point: GeoPoint;
  name?: string; types?: string[]; relevance?: number;
}
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
    return [{ id: typeof f.id === 'string' ? f.id : `place-${index}`, label: label.slice(0, 300), point: { lat, lng },
      ...(typeof f.text === 'string' ? { name: f.text.trim().slice(0, 300) } : {}),
      ...(Array.isArray(f.place_type) ? { types: f.place_type.filter((type): type is string => typeof type === 'string') } : {}),
      ...(typeof f.relevance === 'number' && Number.isFinite(f.relevance) && f.relevance >= 0 && f.relevance <= 1
        ? { relevance: f.relevance } : {}),
    }];
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

export async function suggestPlaces(query: string, near: GeoPoint, signal: AbortSignal): Promise<NamedPlace[]> {
  const text = query.trim();
  if (text.length < 3 || text.length > 200) return [];
  const places = await lookup(text, { types: 'poi,address,road', limit: '5', autocomplete: 'true', proximity: `${near.lng},${near.lat}` }, signal);
  // A city alone is too broad for a pickup or destination, even if the provider ignores the filter.
  return places.filter((place) => place.types?.some((type) => ['poi', 'address', 'road'].includes(type)));
}

export async function reversePlace(point: GeoPoint, signal: AbortSignal): Promise<string | null> {
  const places = await lookup(`${point.lng},${point.lat}`, { types: 'poi,address,road' }, signal);
  return places[0]?.label ?? null;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function resolveRidePlace(hint: string, signal: AbortSignal): Promise<{
  place: NamedPlace | null; candidates: NamedPlace[];
}> {
  const text = hint.trim();
  // A person's current location/home is unknown; never assume the initial map center is it.
  if (/^(?:here|there|home|my (?:home|house|place|dorm)|current location|where i am)$/i.test(text))
    return { place: null, candidates: [] };
  const campusAlias = /^(?:ucm|campus|ucm campus|university of central missouri(?: campus)?)$/i.test(text);
  const localAlias = campusAlias || /^walmart(?: supercenter)?$/i.test(text);
  const query = campusAlias ? 'University of Central Missouri, Warrensburg, Missouri'
    : localAlias ? 'Walmart Supercenter, Warrensburg, Missouri' : text;
  const candidates = await searchPlaces(query, UCM_CAMPUS, signal);
  const [name, ...context] = query.split(',').map(normalize);
  const words = name.split(' ').filter(Boolean);
  const matches = candidates.filter((place) => {
    if ((place.relevance ?? 0) < .9 || !place.types?.some((type) => ['poi', 'address', 'road'].includes(type))) return false;
    const label = normalize(place.label), actual = normalize(place.name ?? '');
    // Require an exact name or complete address; a city-only or fuzzy result is never a pin.
    const exact = actual === name || (place.types.includes('address') && words.every((word) => label.split(' ').includes(word)));
    return exact && context.every((part) => !part || label.includes(part))
      && (context.length > 0 && !localAlias || distanceMiles(UCM_CAMPUS, place.point) <= 25);
  });
  // Duplicate layers at the same physical point are equivalent, distinct branches are not.
  const unique = matches.filter((place, index) => !matches.slice(0, index).some((previous) =>
    distanceMiles(previous.point, place.point) < .02));
  return { place: unique.length === 1 ? unique[0] : null, candidates };
}
