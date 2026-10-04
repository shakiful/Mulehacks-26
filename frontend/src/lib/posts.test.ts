import { describe, expect, it } from "vitest";
import { validatePost, isCoordinateLabel, ridePlaceLabel } from "./posts";
import type { CreatePostInput } from "../api/types";

const ride = {
  category: "RIDE",
  intent: "REQUEST",
  title: "Walmart ride",
  text: "Synthetic ride request",
  location: null,
  starts_at: "2026-10-03T18:00:00-05:00",
  ends_at: null,
  details: { origin: "UCM", destination: "Walmart", seats: 1, purpose: null,
    origin_point: { lat: 38.7625, lng: -93.7395 }, destination_point: { lat: 38.7905, lng: -93.7390 } },
} satisfies CreatePostInput;
describe("confirmed post validation", () => {
  it('hides old coordinate placeholders without removing real street numbers or names', () => {
    expect(isCoordinateLabel('Pickup (38.76104, -93.74312)')).toBe(true);
    expect(ridePlaceLabel('Pickup (38.76104, -93.74312)', 'origin')).toBe('Selected pickup location');
    expect(ridePlaceLabel('120 College Avenue', 'origin')).toBe('120 College Avenue');
    expect(ridePlaceLabel('Walmart', 'destination')).toBe('Walmart');
  });
  it("rejects invalid seats, missing routes, ambiguous dates, and invalid intervals", () => {
    expect(validatePost(ride)).toEqual([]);
    const errors = validatePost({
      ...ride,
      starts_at: "tomorrow",
      ends_at: "2026-10-03T17:00:00",
      details: { ...ride.details, origin: "", destination: "", seats: 0 },
    });
    expect(errors.map((error) => error.field)).toEqual(
      expect.arrayContaining([
        "details.seats",
        "details.origin",
        "details.destination",
        "starts_at",
        "ends_at",
      ]),
    );
    expect(
      validatePost({ ...ride, ends_at: "2026-10-03T17:00:00-05:00" }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "ends_at" })]),
    );
    expect(validatePost({ ...ride, starts_at: "2026-10-03T18:00:00" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "starts_at" })]),
    );
    expect(
      validatePost({ ...ride, starts_at: "2026-02-30T18:00:00-05:00" }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "starts_at" })]),
    );
  });
  it("requires category fields and preserves optional nulls", () => {
    const study: CreatePostInput = {
      ...ride,
      category: "STUDY",
      intent: "PARTNER",
      starts_at: null,
      details: { course: null, topic: "SQL", mode: null, skill_level: null },
    };
    expect(validatePost(study)).toEqual([]);
    expect(
      validatePost({ ...study, details: { ...study.details, topic: null } }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "details.course" }),
      ]),
    );
    const food: CreatePostInput = {
      ...ride,
      category: "RESTAURANT",
      intent: "REQUEST",
      details: {
        restaurant: null,
        cuisine: "Indian",
        activity_type: "DINING",
        group_size: 2,
      },
    };
    expect(validatePost(food)).toEqual([]);
    expect(
      validatePost({
        ...food,
        starts_at: null,
        details: { ...food.details, cuisine: null, group_size: 1.5 },
      }).map((error) => error.field),
    ).toEqual(
      expect.arrayContaining([
        "details.restaurant",
        "details.group_size",
        "starts_at",
      ]),
    );
  });
});
