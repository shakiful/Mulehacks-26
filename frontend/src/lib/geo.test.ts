import { describe, expect, it } from 'vitest';
import { distanceMiles, rideDistanceMiles, RIDE_MATCH_RADIUS_MILES } from './geo';

describe('ride miles', () => {
  it('converts measured distance and the existing five-km gate to statute miles', () => {
    expect(distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(distanceMiles({ lat: 38.7625, lng: -93.7395 }, { lat: 38.7675, lng: -93.7395 })).toBeCloseTo(.34547, 4);
    expect(RIDE_MATCH_RADIUS_MILES).toBeCloseTo(3.10685596, 7);
    expect(distanceMiles({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 })).toBeCloseTo(1.38187, 4);
  });
  it('requires two valid finite points instead of reporting a fabricated route distance', () => {
    expect(rideDistanceMiles(null, { lat: 0, lng: 0 })).toBeNull();
    expect(rideDistanceMiles({ lat: 91, lng: 0 }, { lat: 0, lng: 0 })).toBeNull();
    expect(rideDistanceMiles({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toBeNull();
    expect(rideDistanceMiles({ lat: true, lng: 0 }, { lat: 0, lng: 0 })).toBeNull();
  });
});
