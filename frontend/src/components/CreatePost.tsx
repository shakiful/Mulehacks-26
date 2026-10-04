import { lazy, Suspense, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ApiError } from "../api/errors";
import type {
  Category,
  CreatePostInput,
  FieldError,
  Intent,
  Post,
  Understanding,
  DraftDetails,
  GeoPoint,
} from "../api/types";
import { useApi } from "../context/ApiContext";
import { blankDetails, categoryNames, validatePost, isCoordinateLabel, ridePlaceLabel } from "../lib/posts";
import { questionsForDraft } from "../lib/clarifications";
import { CAMPUS_TIME_ZONE, fromTimestamp, resolveDateTime, type DateTimeDraft } from "../lib/dateTime";
import { ErrorState } from "./States";
import { Field } from "./Field";
import { DateTimeFields } from "./DateTimeFields";
import { RidePlaceField } from './RidePlaceField';
import type { RidePointField } from './RideLocationAutofill';
import type { NamedPlace } from '../lib/places';
import { rideDistanceMiles, RIDE_MATCH_RADIUS_MILES, UCM_CAMPUS } from '../lib/geo';
const RideRoutePicker = lazy(() => import("./RideRoutePicker"));

export function CreatePost({
  category = "RIDE",
  preview,
  previewContext,
  initialPost,
  onCancel,
  onCreated,
}: {
  category?: Category;
  preview?: Understanding;
  previewContext?: { reference_time: string; timezone: string };
  initialPost?: Post;
  onCancel?: () => void;
  onCreated: (post: Post) => void;
}) {
  const { api } = useApi();
  const initial = initialPost ?? preview;
  const [selectedCategory, setCategory] = useState<Category>(
    initial && initial.category !== "CYBERSECURITY"
      ? initial.category
      : category,
  );
  const [intent, setIntent] = useState<Intent>(initial?.intent ?? "REQUEST");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startDateTime, setStartDateTime] = useState(() => fromTimestamp(initial?.starts_at));
  const [endDateTime, setEndDateTime] = useState(() => fromTimestamp(initial?.ends_at));
  const startResolution = resolveDateTime(startDateTime);
  const endResolution = resolveDateTime(endDateTime);
  const startsAt = startResolution.timestamp ?? "";
  const endsAt = endResolution.timestamp ?? "";
  const [details, setDetails] = useState<
    DraftDetails
  >(() => {
    const initialDetails: DraftDetails = { ...(initialPost?.details ?? preview?.details ?? blankDetails(selectedCategory)) };
    if (selectedCategory === 'RIDE' && !initialPost?.ride_availability?.reserved_seats) {
      for (const label of ['origin', 'destination']) if (isCoordinateLabel(initialDetails[label])) initialDetails[label] = '';
    }
    return initialDetails;
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [currentPreview, setCurrentPreview] = useState(preview);
  const [answer, setAnswer] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<unknown>(null);
  const [refineMessage, setRefineMessage] = useState("");
  const [showMap, setShowMap] = useState(false);
  const routeLocked = Boolean(initialPost?.ride_availability?.reserved_seats);
  const routeMiles = rideDistanceMiles(details.origin_point, details.destination_point);
  const dirty = useRef(new Set<string>());
  const manualMapLabels = useRef(new Set<RidePointField>());
  const context = useRef(previewContext ?? {
    reference_time: new Date().toISOString(),
    timezone: CAMPUS_TIME_ZONE,
  });
  const questions = preview ? questionsForDraft({
    category: selectedCategory, intent, location, starts_at: startsAt, ends_at: endsAt, details,
  }) : [];
  const fieldError = (name: string) =>
    errors.find((error) => error.field === name)?.message;
  const rideHint = (label: 'origin' | 'destination'): string | null => {
    const hint = currentPreview?.category === 'RIDE' ? currentPreview.details?.[label] : null;
    return selectedCategory === 'RIDE' && typeof hint === 'string' && hint.trim() && details[label] === hint
      && !details[`${label}_point`] && !dirty.current.has(`details.${label}`) && !dirty.current.has(`details.${label}_point`)
      ? hint : null;
  };
  const changeDetail = (key: string, value: string | number | GeoPoint | null) => {
    dirty.current.add(`details.${key}`);
    setDetails((current) => ({ ...current, [key]: value }));
  };
  const selectRidePlace = (field: RidePointField, point: GeoPoint, name: string | null) => {
    if (routeLocked) return;
    const label = field === 'origin_point' ? 'origin' : 'destination';
    dirty.current.add(`details.${field}`);
    dirty.current.add(`details.${label}`);
    if (name === null) manualMapLabels.current.add(field);
    else manualMapLabels.current.delete(field);
    setDetails((current) => ({ ...current, [field]: point, [label]: name ?? '' }));
  };
  const resolveRideName = (field: RidePointField, point: GeoPoint, name: string) => {
    const label = field === 'origin_point' ? 'origin' : 'destination';
    setDetails((current) => {
      const selected = current[field];
      if (routeLocked || !selected || typeof selected !== 'object' || selected.lat !== point.lat || selected.lng !== point.lng
        || current[label]) return current;
      manualMapLabels.current.delete(field);
      return { ...current, [label]: name };
    });
  };
  const autoResolveRidePlace = (field: RidePointField, hint: string, place: NamedPlace) => {
    const label = field === 'origin_point' ? 'origin' : 'destination';
    setDetails((current) => {
      if (routeLocked || current[label] !== hint || current[field] || dirty.current.has(`details.${label}`)
        || dirty.current.has(`details.${field}`)) return current;
      return { ...current, [field]: place.point, [label]: place.label };
    });
  };
  const edit = (field: string, setter: (value: string) => void, value: string) => {
    dirty.current.add(field);
    setter(value);
  };
  const editDateTime = (field: string, setter: (value: DateTimeDraft) => void, value: DateTimeDraft) => {
    dirty.current.add(field);
    setter(value);
  };

  async function refine() {
    if (!answer.trim() || refining || pending) return;
    const combined = `${text.trim()}\nAdditional details: ${answer.trim()}`;
    if (combined.length > 4000) {
      setRefineError(new Error("Please shorten your answer or description to fit within 4,000 characters."));
      return;
    }
    setRefining(true);
    setRefineError(null);
    setRefineMessage("");
    try {
      const result = await api.understand({
        text: combined, category_hint: selectedCategory, ...context.current,
      });
      if (result.category !== selectedCategory || result.intent === null || result.details === null)
        throw new Error("The preview could not update this category. Please edit the fields below.");
      if (!dirty.current.has("title")) setTitle(result.title);
      if (!dirty.current.has("intent")) setIntent(result.intent);
      const authoritative = result.analysis_mode === "LLM";
      if (!dirty.current.has("location") && (authoritative || result.location?.trim())) setLocation(result.location ?? "");
      if (!dirty.current.has("starts_at") && (authoritative || result.starts_at)) setStartDateTime(fromTimestamp(result.starts_at));
      if (!dirty.current.has("ends_at") && (authoritative || result.ends_at)) setEndDateTime(fromTimestamp(result.ends_at));
      setDetails((current) => {
        const updated = { ...current };
        for (const [name, value] of Object.entries(result.details!)) {
          if (!dirty.current.has(`details.${name}`) && (authoritative || (value !== null && value !== ""))) updated[name] = value;
        }
        if (selectedCategory === 'RIDE') {
          for (const label of ['origin', 'destination']) {
            const field = `${label}_point`;
            if (!dirty.current.has(`details.${label}`) && !dirty.current.has(`details.${field}`)
              && updated[label] !== current[label]) updated[field] = null;
          }
        }
        return updated;
      });
      setText(combined);
      setCurrentPreview(result);
      setAnswer("");
      setErrors([]);
      setRefineMessage("Your form is updated. Review the details before posting.");
    } catch (error) {
      setRefineError(error);
    } finally {
      setRefining(false);
    }
  }
  const detailField = (
    name: string,
    label: string,
    hint?: string,
    numeric = false,
  ) => (
    <Field
      key={name}
      label={label}
      hint={hint}
      error={fieldError(`details.${name}`)}
    >
      {(props) => (
        <input
          {...props}
          type={numeric ? "number" : "text"}
          min={numeric ? 1 : undefined}
          step={numeric ? 1 : undefined}
          value={typeof details[name] === "object" ? "" : selectedCategory === 'RIDE' && (name === 'origin' || name === 'destination')
            ? ridePlaceLabel(details[name], name) : details[name] ?? ""}
          onChange={(event) =>
            changeDetail(
              name,
              numeric ? Number(event.target.value) : event.target.value || null,
            )
          }
        />
      )}
    </Field>
  );
  const detailSelect = (
    name: string,
    label: string,
    options: [string, string][],
    nullable = false,
  ) => (
    <Field key={name} label={label} error={fieldError(`details.${name}`)}>
      {(props) => (
        <select
          {...props}
          value={typeof details[name] === "object" ? "" : details[name] ?? ""}
          onChange={(event) => changeDetail(name, event.target.value || null)}
        >
          {nullable && <option value="">Unspecified</option>}
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    // The editable draft crosses into the contract type only after the validation below succeeds.
    const input = {
      category: selectedCategory,
      intent,
      title: title.trim(),
      text: text.trim(),
      location: location.trim() || null,
      starts_at: startsAt.trim() || null,
      ends_at: endsAt.trim() || null,
      details,
    } as unknown as CreatePostInput;
    const timeErrors: FieldError[] = [];
    if (startResolution.error) timeErrors.push({ field: "starts_at", message: startResolution.error });
    if (endResolution.error) timeErrors.push({ field: "ends_at", message: endResolution.error });
    const validation = [...timeErrors, ...validatePost(input).filter((error) => !timeErrors.some((time) => time.field === error.field))];
    setErrors(validation);
    setRequestError(null);
    if (validation.length) return;
    setPending(true);
    try {
      const post = initialPost
        ? await api.editPost(initialPost.id, input)
        : await api.createPost(input);
      onCreated(post);
    } catch (error) {
      setRequestError(error);
      if (error instanceof ApiError) setErrors(error.details);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={submit} noValidate>
      <div className="flex items-start gap-3">
        <span className="small-icon">
          <CheckCircle2 size={22} />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {initialPost ? "Edit your post" : preview
              ? "A quick check before you connect."
              : "Start a new connection"}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {initialPost
              ? "Update your details, then save your changes."
              : preview
              ? "Review and correct the extracted details. You decide what gets posted."
              : "Share what you need, or something you can offer."}
          </p>
        </div>
      </div>
      {currentPreview && (
        <div className="notice mt-5">
          <p className="font-medium">
            Preview mode: {currentPreview.analysis_mode.toLowerCase()}
          </p>
          {questions.some((question) => question.required) && (
            <p className="mt-1">
              Please confirm:{" "}
              {questions.filter((question) => question.required).map((question) => question.field).join(", ")
                .replaceAll("details.", "")
                .replaceAll("_", " ")}
              .
            </p>
          )}
          {currentPreview.analysis_mode === "HEURISTIC" && (
            <p className="mt-1">Rule-based preview: useful when Gemini is unavailable. You can still fill the fields below.</p>
          )}
          {currentPreview.warnings.map((warning) => (
            <p key={warning} className="mt-1">
              {warning}
            </p>
          ))}
        </div>
      )}
      {preview && questions.length > 0 && (
        <section className="notice mt-5" aria-label="Missing details">
          <h3 className="font-semibold">A few details to finish</h3>
          <p className="mt-1 text-sm">I filled in what you provided. Answer these in a sentence, or edit the fields below.</p>
          <ul className="mt-3 space-y-2">
            {questions.map((question) => (
              <li key={question.field}>
                {question.question} <span className="text-xs text-stone-500">{question.required ? "Needed before posting" : "Helps find better matches"}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Field label="Add missing details" hint="For example: Tomorrow from 6 to 7 pm, in person at the Library.">
              {(props) => <textarea {...props} rows={2} maxLength={4000} value={answer}
                disabled={pending || refining} onChange={(event) => setAnswer(event.target.value)} />}
            </Field>
          </div>
          <button type="button" className="button-primary mt-3" disabled={pending || refining || !answer.trim()} onClick={refine}>
            {refining ? "Updating your form…" : "Fill in my form"}
          </button>
          {refineError !== null && <div className="mt-3"><ErrorState error={refineError} /></div>}
        </section>
      )}
      {refineMessage && <p role="status" className="notice mt-4">{refineMessage}</p>}
      {Boolean(initialPost?.ride_availability?.reserved_seats) && (
        <p className="notice mt-4">Passengers are already accepted. Keep the same From/To locations and times.
          You can edit the description or change capacity above the reserved count.
          Setting capacity to the reserved count marks this ride filled.</p>
      )}
      {errors.length > 0 && (
        <div className="error-panel mt-5" role="alert">
          Correct the highlighted fields before {initialPost ? "saving" : "posting"}.
        </div>
      )}
      {requestError !== null && (
        <div className="mt-5">
          <ErrorState error={requestError} />
        </div>
      )}
      <fieldset disabled={pending || refining} className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Category" error={fieldError("category")}>
          {(props) => (
            <select
              {...props}
              value={selectedCategory}
              disabled={Boolean(initialPost)}
              onChange={(event) => {
                const next = event.target.value as Category;
                setCategory(next);
                setDetails(blankDetails(next));
                for (const field of dirty.current) if (field.startsWith("details.")) dirty.current.delete(field);
                if (
                  intent === "PARTNER" &&
                  ["RIDE", "RESTAURANT"].includes(next)
                )
                  setIntent("REQUEST");
                setErrors([]);
              }}
            >
              {Object.entries(categoryNames)
                .filter(([key]) => key !== "CYBERSECURITY")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label="I want to…" error={fieldError("intent")}>
          {(props) => (
            <select
              {...props}
              value={intent}
              onChange={(event) => { dirty.current.add("intent"); setIntent(event.target.value as Intent); }}
            >
              <option value="REQUEST">Request help / join</option>
              <option value="OFFER">Offer help / host</option>
              {["STUDY", "COMMUNITY"].includes(selectedCategory) && (
                <option value="PARTNER">Find a partner</option>
              )}
            </select>
          )}
        </Field>
        <div className="md:col-span-2">
          <Field label="Post title" error={fieldError("title")}>
            {(props) => (
              <input
                {...props}
                value={title}
                maxLength={120}
                placeholder="Give your connection a little context"
                onChange={(event) => edit("title", setTitle, event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Description" error={fieldError("text")}>
            {(props) => (
              <textarea
                {...props}
                value={text}
                maxLength={4000}
                rows={3}
                placeholder="What would you like your campus community to know?"
                onChange={(event) => edit("text", setText, event.target.value)}
              />
            )}
          </Field>
        </div>
        {selectedCategory === "RIDE" && (
          <>
            {(['origin', 'destination'] as const).map((label) => {
              const field: RidePointField = `${label}_point`;
              return <RidePlaceField key={label} field={field} value={ridePlaceLabel(details[label], label)}
                point={typeof details[field] === 'object' ? details[field] : null}
                near={label === 'destination' && typeof details.origin_point === 'object' && details.origin_point
                  ? details.origin_point : UCM_CAMPUS}
                autoHint={rideHint(label)} disabled={pending || refining || routeLocked}
                error={fieldError(`details.${label}`) ?? fieldError(`details.${field}`)}
                onEdit={(value) => {
                  if (routeLocked) return;
                  dirty.current.add(`details.${label}`); dirty.current.add(`details.${field}`);
                  // Suggestion edits invalidate its point. An unnamed, explicitly clicked map point
                  // can still receive a manual name if geocoding is offline.
                  setDetails((current) => ({ ...current, [label]: value,
                    [field]: manualMapLabels.current.has(field) ? current[field] : null }));
                }}
                onSelect={(place) => selectRidePlace(field, place.point, place.label)}
                onAutoResolved={autoResolveRidePlace}
                onNameResolved={(point, name) => resolveRideName(field, point, name)} />;
            })}
            <div className="md:col-span-2">
              <p className="text-sm text-stone-600" aria-live="polite">
                {routeMiles === null ? 'Choose both locations to calculate distance.'
                  : `From → To: ${routeMiles.toFixed(2)} miles straight-line. Driving distance may be longer.`}
              </p>
              <p className="mt-1 text-xs text-stone-500">Ride matches need pickup and destination locations within {RIDE_MATCH_RADIUS_MILES.toFixed(2)} miles each.</p>
              <p className="mt-1 text-xs text-stone-500">Place searches are sent to MapTiler. Use a place or street name; no device location is requested.</p>
              {preview && <p className="mt-2 text-sm text-stone-600">Places from your sentence can fill these fields automatically. Review the addresses before posting.</p>}
              <button type="button" className="text-button mt-3" aria-expanded={showMap} aria-controls="ride-route-map"
                onClick={() => setShowMap((visible) => !visible)}>{showMap ? 'Hide map' : 'Show map (optional)'}</button>
              {showMap && <div id="ride-route-map" className="mt-3"><Suspense fallback={<p role="status">Loading the route map…</p>}>
                <RideRoutePicker
                  origin={typeof details.origin_point === "object" ? details.origin_point : null}
                  destination={typeof details.destination_point === "object" ? details.destination_point : null}
                  originLabel={ridePlaceLabel(details.origin, 'origin')}
                  destinationLabel={ridePlaceLabel(details.destination, 'destination')}
                  disabled={pending || refining || routeLocked}
                  errors={[fieldError("details.origin_point"), fieldError("details.destination_point")].filter(Boolean) as string[]}
                  onSelect={selectRidePlace}
                  onNameResolved={resolveRideName}
                />
              </Suspense></div>}
            </div>
            {detailField(
              "seats",
              intent === "REQUEST" ? "Seats needed" : "Seats available",
              "Enter a whole number of seats.",
              true,
            )}
            {detailField("purpose", "Trip purpose (optional)")}
          </>
        )}
        {selectedCategory === "STUDY" && (
          <>
            {detailField("course", "Course", "A course or topic is required.")}
            {detailField("topic", "Topic")}
            {detailSelect(
              "skill_level",
              "Skill level",
              [
                ["BEGINNER", "Beginner"],
                ["INTERMEDIATE", "Intermediate"],
                ["ADVANCED", "Advanced"],
              ],
              true,
            )}
            {detailSelect(
              "mode",
              "Meeting mode",
              [
                ["ONLINE", "Online"],
                ["IN_PERSON", "In person"],
              ],
              true,
            )}
          </>
        )}
        {selectedCategory === "RESTAURANT" && (
          <>
            {detailField(
              "restaurant",
              "Restaurant",
              "A restaurant or cuisine is required.",
            )}
            {detailField("cuisine", "Cuisine")}
            {detailSelect("activity_type", "Activity", [
              ["DINING", "Dining together"],
              ["GROUP_ORDER", "Group order"],
              ["TRIP", "Food trip"],
            ])}
            {detailField(
              "group_size",
              "Desired group size",
              "Total desired group size; no capacity is reserved.",
              true,
            )}
          </>
        )}
        {selectedCategory === "COMMUNITY" && (
          <>
            {detailSelect("subcategory", "Community category", [
              ["BORROW_LEND", "Borrow & lend"],
              ["CAMPUS_HELP", "Campus help"],
              ["ACTIVITY", "Activities"],
              ["MOVING", "Moving"],
              ["SHOPPING", "Shopping"],
              ["NEW_STUDENT", "New student help"],
              ["OTHER", "Other"],
            ])}
            {detailField("item", "Item (optional)")}
            {detailField("activity", "Activity (optional)")}
          </>
        )}
        <Field label="Location (optional)" error={fieldError("location")}>
          {(props) => (
            <input
              {...props}
              value={location}
              placeholder="e.g. Library"
              onChange={(event) => edit("location", setLocation, event.target.value)}
            />
          )}
        </Field>
        <DateTimeFields label="Start" value={startDateTime} error={fieldError("starts_at")}
          required={["RIDE", "RESTAURANT"].includes(selectedCategory)}
          onChange={(value) => editDateTime("starts_at", setStartDateTime, value)} />
        <DateTimeFields label="End" value={endDateTime} error={fieldError("ends_at")}
          onChange={(value) => editDateTime("ends_at", setEndDateTime, value)} />
      </fieldset>
      {selectedCategory === "RESTAURANT" && (
        <p className="mt-5 text-xs text-stone-500">
          Connecting expresses interest. It does not place an order or reserve
          capacity.
        </p>
      )}
      {initialPost && (
        <p className="notice mt-5">
          Changes affect future matches. Existing connection requests stay in your
          inbox; coordinate changed details with the other person.
        </p>
      )}
      <div className="mt-6 flex items-center justify-between gap-4 border-t border-stone-100 pt-5">
        <p className="max-w-xs text-xs text-stone-500">
          This post is public within the local demo. Use synthetic details.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          {initialPost && onCancel && (
            <button className="button-secondary" disabled={pending} type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="button-primary" disabled={pending || refining} type="submit">
            {initialPost
              ? pending ? "Saving…" : "Save changes"
              : pending ? "Posting…" : "Confirm & post"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </form>
  );
}
