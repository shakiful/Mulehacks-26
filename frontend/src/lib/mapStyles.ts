export interface MapStyleProvider { name: "MapTiler" | "OpenFreeMap"; style: string }
export function mapStyles(key = import.meta.env.VITE_MAPTILER_API_KEY?.trim()): MapStyleProvider[] {
  const open = { name: "OpenFreeMap" as const, style: "https://tiles.openfreemap.org/styles/liberty" };
  return key
    ? [{ name: "MapTiler", style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(key)}` }, open]
    : [open];
}
