import type { Category, CreatePostInput, DraftDetails, FieldError } from "../api/types";

export const categoryNames: Record<Category | "CYBERSECURITY", string> = {
  RIDE: "Ride Connect",
  STUDY: "Study Connect",
  RESTAURANT: "Food Connect",
  COMMUNITY: "Community",
  CYBERSECURITY: "Security",
};

export const blankDetails = (
  category: Category,
): DraftDetails => {
  switch (category) {
    case "RIDE":
      return { origin: "", destination: "", origin_point: null, destination_point: null, seats: 1, purpose: null };
    case "STUDY":
      return { course: null, topic: null, skill_level: null, mode: null };
    case "RESTAURANT":
      return {
        restaurant: null,
        cuisine: null,
        activity_type: "DINING",
        group_size: 2,
      };
    case "COMMUNITY":
      return { subcategory: "OTHER", item: null, activity: null };
  }
};

// Input validation is shared by the editable form and the mock adapter. Matching stays on the server.
export function validatePost(input: CreatePostInput): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) =>
    errors.push({ field, message });
  const nonempty = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;
  if (!nonempty(input.title) || input.title.length > 120)
    add("title", "Use a title between 1 and 120 characters.");
  if (!nonempty(input.text) || input.text.length > 4000)
    add("text", "Use a description between 1 and 4000 characters.");
  if (!["RIDE", "STUDY", "RESTAURANT", "COMMUNITY"].includes(input.category))
    add("category", "Choose a public post category.");
  const intents = ["RIDE", "RESTAURANT"].includes(input.category)
    ? ["REQUEST", "OFFER"]
    : ["REQUEST", "OFFER", "PARTNER"];
  if (!intents.includes(input.intent))
    add("intent", "Choose a supported intent.");
  const timestamp =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const validTime = (value: string) => {
    const match = timestamp.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const [, year, month, day, hour, minute, second = "0"] = match;
    const daysInMonth = new Date(
      Date.UTC(Number(year), Number(month), 0),
    ).getUTCDate();
    return (
      Number(month) >= 1 &&
      Number(month) <= 12 &&
      Number(day) >= 1 &&
      Number(day) <= daysInMonth &&
      Number(hour) < 24 &&
      Number(minute) < 60 &&
      Number(second) < 60
    );
  };
  for (const field of ["starts_at", "ends_at"] as const) {
    if (input[field] && !validTime(input[field]))
      add(field, "Enter an ISO date and time with a UTC offset.");
  }
  if (
    input.ends_at &&
    (!input.starts_at ||
      Date.parse(input.ends_at) <= Date.parse(input.starts_at))
  )
    add("ends_at", "End time must be later than the start time.");
  if (!input.details || typeof input.details !== "object") {
    add("details", "Category details are required.");
    return errors;
  }
  switch (input.category) {
    case "RIDE":
      for (const field of ["origin_point", "destination_point"] as const) {
        const point = input.details[field];
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)
          || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)
          add(`details.${field}`, `Select the ${field === "origin_point" ? "From" : "To"} point on the map.`);
      }
      if (!nonempty(input.details.origin))
        add("details.origin", "Enter the starting location.");
      if (!nonempty(input.details.destination))
        add("details.destination", "Enter the destination.");
      if (!Number.isInteger(input.details.seats) || input.details.seats < 1)
        add("details.seats", "Must be at least 1 and a whole number.");
      if (!input.starts_at)
        add("starts_at", "Confirm the departure date and time.");
      break;
    case "STUDY":
      if (!nonempty(input.details.course) && !nonempty(input.details.topic))
        add("details.course", "Enter a course or topic.");
      if (
        input.details.mode !== null &&
        !["ONLINE", "IN_PERSON"].includes(input.details.mode)
      )
        add("details.mode", "Choose Online or In person.");
      if (
        input.details.skill_level !== null &&
        !["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(
          input.details.skill_level,
        )
      )
        add("details.skill_level", "Choose a supported skill level.");
      break;
    case "RESTAURANT":
      if (
        !nonempty(input.details.restaurant) &&
        !nonempty(input.details.cuisine)
      )
        add("details.restaurant", "Enter a restaurant or cuisine.");
      if (
        !["DINING", "GROUP_ORDER", "TRIP"].includes(input.details.activity_type)
      )
        add("details.activity_type", "Choose an activity type.");
      if (
        !Number.isInteger(input.details.group_size) ||
        input.details.group_size < 1
      )
        add("details.group_size", "Must be at least 1 and a whole number.");
      if (!input.starts_at) add("starts_at", "Confirm the date and time.");
      break;
    case "COMMUNITY":
      if (
        ![
          "BORROW_LEND",
          "CAMPUS_HELP",
          "ACTIVITY",
          "MOVING",
          "SHOPPING",
          "NEW_STUDENT",
          "OTHER",
        ].includes(input.details.subcategory)
      )
        add("details.subcategory", "Choose a community category.");
      break;
  }
  return errors;
}
