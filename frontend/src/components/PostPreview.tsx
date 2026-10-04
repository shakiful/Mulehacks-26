import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Category, Understanding, UnderstandingCategory } from "../api/types";
import { useApi } from "../context/ApiContext";
import { CAMPUS_TIME_ZONE } from "../lib/dateTime";
import { categoryNames } from "../lib/posts";
import { CreatePost } from "./CreatePost";
import { ErrorState } from "./States";

export function PostPreview({ category }: { category?: Category }) {
  const { api, isMock } = useApi();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [preview, setPreview] = useState<Understanding | null>(null);
  const [previewContext, setPreviewContext] = useState<{ reference_time: string; timezone: string }>();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  useEffect(() => () => { revision.current += 1; }, []);
  const isStudy = category === "STUDY";
  const isRide = category === "RIDE";
  const descriptionId = category ? `${category.toLowerCase()}-description` : "need-description";

  async function understand(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const request = ++revision.current;
    setPending(true);
    setError(null);
    setPreview(null);
    const context = {
      reference_time: new Date().toISOString(),
      timezone: CAMPUS_TIME_ZONE,
    };
    setPreviewContext(context);
    try {
      const result = await api.understand({
        text,
        category_hint: category ?? (hint ? (hint as UnderstandingCategory) : null),
        ...context,
      });
      if (request !== revision.current) return;
      if (category && result.category !== category)
        throw new Error("The preview could not prepare this category. Please try again.");
      if (result.category === "CYBERSECURITY") {
        setText("");
        navigate("/security");
      } else setPreview(result);
    } catch (error) {
      if (request === revision.current) setError(error);
    } finally {
      if (request === revision.current) setPending(false);
    }
  }
  const samples = isStudy ? [
    ["Help with SQL", "I need help studying SQL joins tonight"],
    ["Find a study partner", "I'm looking for a partner to study Python loops online"],
    ["Offer study help", "I can help with calculus derivatives in person at the Library"],
  ] : isRide ? [
    ["Request a ride", "I need a ride from UCM to Walmart tonight at 10 PM for one person"],
    ["Offer a ride", "I'm offering a ride from UCM to Walmart tonight at 10 PM with three seats available"],
    ["Airport ride", "I need a ride from UCM to Kansas City airport tomorrow at 8 AM for two people"],
  ] : [
    ["A ride to Walmart", "I need a ride to Walmart around 6 tonight"],
    ["Help with SQL", "I need help studying SQL joins tonight"],
    ["Borrow a calculator", "Does anyone have a calculator I can borrow?"],
  ];
  function updateDescription(value: string) {
    setText(value);
    setPreview(null);
    setError(null);
  }

  return <>
    <section className="hero-panel" aria-label={isStudy ? "Create a study post" : isRide ? "Create a ride post" : "Describe your connection"}>
      <div className="hero-orbit" aria-hidden="true" />
      <div className="relative max-w-2xl">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Sparkles size={15} />{isStudy ? "A LITTLE HELP CAN MAKE IT CLICK" : isRide ? "SHARE THE JOURNEY" : "A SMALL ASK CAN OPEN A BIG DOOR"}
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
          {isStudy ? "What are you studying?" : isRide ? "Where are you headed?" : "What do you need today?"}
        </h2>
        <p className="mt-2 text-sm">
          {isStudy
            ? "Describe the help you need, a study partner, or what you can teach. Then review the details before posting."
            : isRide ? "Describe the ride you need or a seat you can offer. Then review the details before posting."
            : "Put it in your own words. Then review the details before posting."}
        </p>
        <form onSubmit={understand} className="mt-6">
          <label htmlFor={descriptionId} className="sr-only">
            {isStudy ? "Describe your study needs" : isRide ? "Describe your ride" : "Describe what you need"}
          </label>
          <textarea id={descriptionId} className="hero-input" rows={3} required maxLength={4000}
            value={text} disabled={pending} onChange={(event) => updateDescription(event.target.value)}
            placeholder={isStudy
              ? "e.g. I need help with SQL joins at the Library tonight from 6 to 7 PM…"
              : isRide ? "e.g. I need a ride from UCM to Walmart tonight at 10 PM for one person…"
              : "e.g. I need a ride to Walmart around 6 tonight…"} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {category ? <span className="text-sm font-medium">{categoryNames[category]}</span> : <div>
              <label htmlFor="category-hint" className="sr-only">Preview category</label>
              <select id="category-hint" className="hero-select" value={hint} disabled={pending}
                onChange={(event) => { setHint(event.target.value); setPreview(null); setError(null); }}>
                <option value="">Let the preview choose</option>
                <option value="RIDE">Ride</option>
                <option value="STUDY">Study</option>
                <option value="RESTAURANT">Food</option>
                <option value="COMMUNITY">Community</option>
                <option value="CYBERSECURITY">Private security assessment</option>
              </select>
            </div>}
            <button type="submit" className="button-connect" disabled={pending}>
              {pending ? "Preparing preview…" : isStudy ? "Preview study post" : isRide ? "Preview ride post" : "Find my connections"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs">Try an idea:</span>
          {samples.map(([label, sample]) => <button key={label} className="sample-chip" disabled={pending}
            onClick={() => { updateDescription(sample); setHint(""); }}>{label}</button>)}
        </div>
      </div>
    </section>
    {isMock && <p className="mt-3 text-xs text-stone-500">
      Synthetic fixture data · Fixed fixture dates · Scripted previews and illustrative scores
    </p>}
    {error !== null && <div className="mt-5"><ErrorState error={error} /></div>}
    {preview && <section className="mt-6" aria-label="Review your post">
      <CreatePost key={JSON.stringify(preview)} preview={preview} previewContext={previewContext}
        lockCategory={category !== undefined} onCreated={(post) => navigate(`/posts/${post.id}/matches`)} />
    </section>}
  </>;
}
