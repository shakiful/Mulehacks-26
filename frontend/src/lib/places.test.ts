import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reversePlace, searchPlaces } from './places';

const point = { lat: 38.7625, lng: -93.7395 };
const feature = { id: 'road.demo', place_name: 'College Avenue, Warrensburg', center: [-93.7395, 38.7625] };
const signal = () => new AbortController().signal;
const fetchSpy = vi.fn();
beforeEach(() => { vi.stubEnv('VITE_MAPTILER_API_KEY', 'synthetic'); vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockReset().mockResolvedValue(new Response(JSON.stringify({ features: [feature] }))); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('MapTiler place lookups', () => {
  it('uses a fixed host, encodes search text and biases results around the map center', async () => {
    expect(await searchPlaces('Walmart / Warrensburg', point, signal())).toEqual([{ id: 'road.demo', label: feature.place_name, point }]);
    const url = fetchSpy.mock.calls[0][0] as URL;
    expect(url.origin).toBe('https://api.maptiler.com');
    expect(url.pathname).toBe('/geocoding/Walmart%20%2F%20Warrensburg.json');
    expect(url.searchParams.get('proximity')).toBe('-93.7395,38.7625');
    expect(url.searchParams.get('autocomplete')).toBe('false');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('types')).toBe('poi,address,road,place,municipality');
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
  });
  it('returns a nearest place, address or street name without replacing the chosen coordinates', async () => {
    expect(await reversePlace(point, signal())).toBe('College Avenue, Warrensburg');
    const url = fetchSpy.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/geocoding/-93.7395%2C38.7625.json');
    expect(url.searchParams.get('types')).toBe('poi,address,road');
  });
  it('drops unnamed or invalid results and accepts point geometry when center is absent', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ features: [
      { ...feature, center: [true, 38] }, { ...feature, center: ['1', 38] }, { ...feature, center: [0, 91] },
      { ...feature, center: [181, 0] }, { ...feature, place_name: '' },
      { id: 'valid', text: 'Walmart', geometry: { type: 'Point', coordinates: [-93.73, 38.79] } },
    ] })));
    expect(await searchPlaces('Walmart', point, signal())).toEqual([{ id: 'valid', label: 'Walmart', point: { lat: 38.79, lng: -93.73 } }]);
  });
  it('handles empty results without inventing a place name', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ features: [] })));
    expect(await searchPlaces('Unknown place', point, signal())).toEqual([]);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ features: [] })));
    expect(await reversePlace(point, signal())).toBeNull();
  });
  it.each(['a', 'x'.repeat(201)])('rejects invalid search length before contacting the provider', async (query) => {
    await expect(searchPlaces(query, point, signal())).rejects.toThrow('between 2 and 200');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('requires a separate public MapTiler key and does not contact providers without it', async () => {
    vi.stubEnv('VITE_MAPTILER_API_KEY', '');
    await expect(searchPlaces('Walmart', point, signal())).rejects.toThrow('type its street or place name');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([403, 429])('redacts provider errors and keys for HTTP %i', async (status) => {
    fetchSpy.mockResolvedValue(new Response('private provider error synthetic', { status }));
    await expect(searchPlaces('Walmart', point, signal())).rejects.toThrow('Place lookup is unavailable.');
  });
  it('handles malformed responses without revealing provider payloads', async () => {
    fetchSpy.mockResolvedValue(new Response('invalid sensitive payload'));
    await expect(searchPlaces('Walmart', point, signal())).rejects.toThrow('Place lookup is unavailable.');
  });
  it('times out a stalled request and passes cancellation to fetch', async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation((_url, options) => new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(new DOMException('provider secret', 'AbortError')))));
    const pending = expect(searchPlaces('Walmart', point, signal())).rejects.toThrow('Place lookup is unavailable.');
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(fetchSpy.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
