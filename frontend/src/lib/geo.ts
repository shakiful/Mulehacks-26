import type { GeoPoint } from '../api/types';

export const MILES_PER_KM = 1 / 1.609344;
export const RIDE_MATCH_RADIUS_MILES = 5 * MILES_PER_KM;
export const UCM_CAMPUS: GeoPoint = { lat: 38.7625, lng: -93.7395 };

// Use the same mean-Earth Haversine model as backend matching; this is not road routing.
export function distanceMiles(a: GeoPoint, b: GeoPoint): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat), lat2 = radians(b.lat);
  const h = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * MILES_PER_KM * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function rideDistanceMiles(origin: unknown, destination: unknown): number | null {
  const valid = (value: unknown): value is GeoPoint => {
    if (!value || typeof value !== 'object') return false;
    const p = value as GeoPoint;
    return typeof p.lat === 'number' && typeof p.lng === 'number'
      && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  };
  return valid(origin) && valid(destination) ? distanceMiles(origin, destination) : null;
}
