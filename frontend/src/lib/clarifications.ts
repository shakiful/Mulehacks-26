import type { Category, DraftDetails, Intent } from "../api/types";

export interface PreviewDraft {
  category: Category;
  intent: Intent;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  details: DraftDetails;
}
export interface Clarification {
  field: string;
  question: string;
  required: boolean;
}

// The question policy uses current editable values, so supplied facts are never asked again.
export function questionsForDraft(draft: PreviewDraft): Clarification[] {
  const questions: Clarification[] = [];
  const empty = (value: unknown) => value == null || value === "" || (typeof value === "string" && !value.trim());
  const ask = (field: string, question: string, required = false) => questions.push({ field, question, required });
  const details = draft.details;
  if (draft.category === "RIDE") {
    if (!details.origin_point) ask("details.origin_point", "Select your From point on the map.", true);
    if (!details.destination_point) ask("details.destination_point", "Select your To point on the map.", true);
    if (empty(details.origin)) ask("details.origin", "Where are you starting from?", true);
    if (empty(details.destination)) ask("details.destination", "Where are you going?", true);
    if (empty(details.seats)) ask("details.seats", draft.intent === "OFFER" ? "How many seats can you offer?" : "How many seats do you need?", true);
    if (empty(draft.starts_at)) ask("starts_at", "What day and time should the ride leave?", true);
    return questions;
  }
  if (draft.category === "STUDY") {
    if (empty(details.course) && empty(details.topic)) ask("details.course", "Which course or topic would you like to study?", true);
    if (empty(details.mode)) ask("details.mode", "Would you like to meet online or in person?");
    if (details.mode === "IN_PERSON" && empty(draft.location)) ask("location", "Where would you like to meet?");
    if (empty(draft.starts_at)) ask("starts_at", "When are you available? Include the day and a start and end time.");
    else if (empty(draft.ends_at)) ask("ends_at", "Until what time are you available?");
    return questions;
  }
  if (draft.category === "RESTAURANT") {
    if (empty(details.restaurant) && empty(details.cuisine)) ask("details.restaurant", "Which restaurant or cuisine do you have in mind?", true);
    if (empty(details.activity_type)) ask("details.activity_type", "Are you planning a meal together, a group order, or a food trip?", true);
    if (empty(details.group_size)) ask("details.group_size", "How many people should be in the group altogether?", true);
    if (empty(draft.starts_at)) ask("starts_at", "What day and time are you planning this?", true);
  } else if (empty(details.subcategory)) {
    ask("details.subcategory", "Is this about borrowing, campus help, an activity, moving, shopping, or meeting people?", true);
  }
  if (empty(draft.location)) ask("location", "Where would you like to meet or pick up the item?");
  if (draft.category === "COMMUNITY" && empty(draft.starts_at)) ask("starts_at", "What day and time would work for you?");
  return questions;
}
