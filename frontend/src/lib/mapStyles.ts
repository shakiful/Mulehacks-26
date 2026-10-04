export interface MapStyleProvider { name: "MapTiler" | "OpenFreeMap"; style: string }
export type MapView = 'satellite' | 'street';
export function mapStyles(key = import.meta.env.VITE_MAPTILER_API_KEY?.trim(), view: MapView = 'satellite'): MapStyleProvider[] {
  const open = { name: "OpenFreeMap" as const, style: "https://tiles.openfreemap.org/styles/bright" };
  return key
    ? [{ name: "MapTiler", style: `https://api.maptiler.com/maps/${view === 'satellite' ? 'hybrid-v4' : 'base-v4'}/style.json?key=${encodeURIComponent(key)}` }, open]
    : [open];
}
