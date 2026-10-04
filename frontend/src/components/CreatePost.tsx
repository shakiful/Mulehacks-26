import { useRef, useState, type FormEvent } from "react";
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
import { questionsForDraft } from "../lib/clarifications";
import { ErrorState } from "./States";
import { Field } from "./Field";

export function CreatePost({
  category = "RIDE",
  preview,
  previewContext,
  onCreated,
}: {
  category?: Category;
  preview?: Understanding;
  previewContext?: { reference_time: string; timezone: string };
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
  const [currentPreview, setCurrentPreview] = useState(preview);
  const [answer, setAnswer] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<unknown>(null);
  const [refineMessage, setRefineMessage] = useState("");
  const dirty = useRef(new Set<string>());
  const context = useRef(previewContext ?? {
    reference_time: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const questions = preview ? questionsForDraft({
    category: selectedCategory, intent, location, starts_at: startsAt, ends_at: endsAt, details,
  }) : [];
  const fieldError = (name: string) =>
    errors.find((error) => error.field === name)?.message;
  const changeDetail = (key: string, value: string | number | null) => {
    dirty.current.add(`details.${key}`);
    setDetails((current) => ({ ...current, [key]: value }));
  };
  const edit = (field: string, setter: (value: string) => void, value: string) => {
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
      if (!dirty.current.has("starts_at") && (authoritative || result.starts_at)) setStartsAt(result.starts_at ?? "");
      if (!dirty.current.has("ends_at") && (authoritative || result.ends_at)) setEndsAt(result.ends_at ?? "");
      setDetails((current) => {
        const updated = { ...current };
        for (const [name, value] of Object.entries(result.details!)) {
          if (!dirty.current.has(`details.${name}`) && (authoritative || (value !== null && value !== ""))) updated[name] = value;
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
      <fieldset disabled={pending || refining} className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Category" error={fieldError("category")}>
          {(props) => (
            <select
              {...props}
              value={selectedCategory}
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
              onChange={(event) => edit("location", setLocation, event.target.value)}
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
              onChange={(event) => edit("starts_at", setStartsAt, event.target.value)}
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
              onChange={(event) => edit("ends_at", setEndsAt, event.target.value)}
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
        <button className="button-primary" disabled={pending || refining} type="submit">
          {pending ? "Posting…" : "Confirm & post"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
