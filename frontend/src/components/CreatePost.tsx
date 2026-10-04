import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ApiError } from "../api/errors";
import type {
  Category,
  CreatePostInput,
  FieldError,
  Intent,
  Post,
  Understanding,
} from "../api/types";
import { useApi } from "../context/ApiContext";
import { blankDetails, categoryNames, validatePost } from "../lib/posts";
import { ErrorState } from "./States";
import { Field } from "./Field";

export function CreatePost({
  category = "RIDE",
  preview,
  onCreated,
}: {
  category?: Category;
  preview?: Understanding;
  onCreated: (post: Post) => void;
}) {
  const { api } = useApi();
  const [selectedCategory, setCategory] = useState<Category>(
    preview && preview.category !== "CYBERSECURITY"
      ? preview.category
      : category,
  );
  const [intent, setIntent] = useState<Intent>(preview?.intent ?? "REQUEST");
  const [title, setTitle] = useState(preview?.title ?? "");
  const [text, setText] = useState(preview?.text ?? "");
  const [location, setLocation] = useState(preview?.location ?? "");
  const [startsAt, setStartsAt] = useState(preview?.starts_at ?? "");
  const [endsAt, setEndsAt] = useState(preview?.ends_at ?? "");
  const [details, setDetails] = useState<
    Record<string, string | number | null>
  >(preview?.details ?? blankDetails(category));
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const fieldError = (name: string) =>
    errors.find((error) => error.field === name)?.message;
  const changeDetail = (key: string, value: string | number | null) =>
    setDetails((current) => ({ ...current, [key]: value }));
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
          value={details[name] ?? ""}
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
          value={details[name] ?? ""}
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
    const validation = validatePost(input);
    setErrors(validation);
    setRequestError(null);
    if (validation.length) return;
    setPending(true);
    try {
      const post = await api.createPost(input);
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
            {preview
              ? "A quick check before you connect."
              : "Start a new connection"}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {preview
              ? "Review and correct the extracted details. You decide what gets posted."
              : "Share what you need, or something you can offer."}
          </p>
        </div>
      </div>
      {preview && (
        <div className="notice mt-5">
          <p className="font-medium">
            Preview mode: {preview.analysis_mode.toLowerCase()}
          </p>
          {preview.missing_fields.length > 0 && (
            <p className="mt-1">
              Please confirm:{" "}
              {preview.missing_fields
                .join(", ")
                .replaceAll("details.", "")
                .replaceAll("_", " ")}
              .
            </p>
          )}
          {preview.warnings.map((warning) => (
            <p key={warning} className="mt-1">
              {warning}
            </p>
          ))}
        </div>
      )}
      {errors.length > 0 && (
        <div className="error-panel mt-5" role="alert">
          Correct the highlighted fields before posting.
        </div>
      )}
      {requestError !== null && (
        <div className="mt-5">
          <ErrorState error={requestError} />
        </div>
      )}
      <fieldset disabled={pending} className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Category" error={fieldError("category")}>
          {(props) => (
            <select
              {...props}
              value={selectedCategory}
              onChange={(event) => {
                const next = event.target.value as Category;
                setCategory(next);
                setDetails(blankDetails(next));
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
              onChange={(event) => setIntent(event.target.value as Intent)}
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
                onChange={(event) => setTitle(event.target.value)}
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
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>
        </div>
        {selectedCategory === "RIDE" && (
          <>
            {detailField("origin", "From")}
            {detailField("destination", "To")}
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
              onChange={(event) => setLocation(event.target.value)}
            />
          )}
        </Field>
        <Field
          label={
            ["RIDE", "RESTAURANT"].includes(selectedCategory)
              ? "Start date & time"
              : "Start date & time (optional)"
          }
          error={fieldError("starts_at")}
          hint="Include the UTC offset, e.g. 2026-10-03T18:00:00-05:00. Confirm the date yourself."
        >
          {(props) => (
            <input
              {...props}
              value={startsAt}
              placeholder="YYYY-MM-DDTHH:MM:SS±HH:MM"
              onChange={(event) => setStartsAt(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="End date & time (optional)"
          error={fieldError("ends_at")}
          hint="Use an ISO timestamp with a UTC offset; must be after the start."
        >
          {(props) => (
            <input
              {...props}
              value={endsAt}
              placeholder="YYYY-MM-DDTHH:MM:SS±HH:MM"
              onChange={(event) => setEndsAt(event.target.value)}
            />
          )}
        </Field>
      </fieldset>
      {selectedCategory === "RESTAURANT" && (
        <p className="mt-5 text-xs text-stone-500">
          Connecting expresses interest. It does not place an order or reserve
          capacity.
        </p>
      )}
      <div className="mt-6 flex items-center justify-between gap-4 border-t border-stone-100 pt-5">
        <p className="max-w-xs text-xs text-stone-500">
          This post is public within the local demo. Use synthetic details.
        </p>
        <button className="button-primary" disabled={pending} type="submit">
          {pending ? "Posting…" : "Confirm & post"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
