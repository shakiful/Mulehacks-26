import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  CarFront,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Understanding, UnderstandingCategory } from "../api/types";
import { useApi } from "../context/ApiContext";
import { CreatePost } from "../components/CreatePost";
import { CategoryCard } from "../components/CategoryCard";
import { PostBoard } from "../components/PostBoard";
import { ErrorState } from "../components/States";

export function DashboardPage() {
  const { api, isMock } = useApi();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [preview, setPreview] = useState<Understanding | null>(null);
  const [previewContext, setPreviewContext] = useState<{ reference_time: string; timezone: string }>();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  async function understand(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setPreview(null);
    const context = {
      reference_time: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    setPreviewContext(context);
    try {
      const result = await api.understand({
        text,
        category_hint: hint ? (hint as UnderstandingCategory) : null,
        ...context,
      });
      if (result.category === "CYBERSECURITY") {
        setText("");
        navigate("/security");
      } else setPreview(result);
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  const samples = [
    ["A ride to Walmart", "I need a ride to Walmart around 6 tonight"],
    ["Help with SQL", "I need help studying SQL joins tonight"],
    ["Borrow a calculator", "Does anyone have a calculator I can borrow?"],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CAMPUS, A LITTLE CLOSER</p>
          <h1>
            Good things start
            <br className="hidden sm:block" /> with a connection
            <span className="text-[#c9744c]">.</span>
          </h1>
          <p>
            A ride, a shared meal, a fresh perspective. Find your people here.
          </p>
        </div>
        <span className="campus-label">
          <span />
          UCM · Campus demo
        </span>
      </div>
      <section className="hero-panel">
        <div className="hero-orbit" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-medium text-[#cce0bc]">
            <Sparkles size={15} />A SMALL ASK CAN OPEN A BIG DOOR
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            What do you need today?
          </h2>
          <p className="mt-2 text-sm text-emerald-100/70">
            Put it in your own words. Then review the details before posting.
          </p>
          <form onSubmit={understand} className="mt-6">
            <label htmlFor="need-description" className="sr-only">
              Describe what you need
            </label>
            <textarea
              id="need-description"
              className="hero-input"
              rows={3}
              required
              maxLength={4000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="e.g. I need a ride to Walmart around 6 tonight…"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <label htmlFor="category-hint" className="sr-only">
                  Preview category
                </label>
                <select
                  id="category-hint"
                  className="hero-select"
                  value={hint}
                  onChange={(event) => setHint(event.target.value)}
                >
                  <option value="">Let the preview choose</option>
                  <option value="RIDE">Ride</option>
                  <option value="STUDY">Study</option>
                  <option value="RESTAURANT">Food</option>
                  <option value="COMMUNITY">Community</option>
                  <option value="CYBERSECURITY">
                    Private security assessment
                  </option>
                </select>
              </div>
              <button type="submit" className="button-peach" disabled={pending}>
                {pending ? "Preparing preview…" : "Find my connections"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-emerald-100/60">Try an idea:</span>
            {samples.map(([label, sample]) => (
              <button
                key={label}
                className="sample-chip"
                onClick={() => {
                  setText(sample);
                  setHint("");
                  setPreview(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      {isMock && (
        <p className="mt-3 text-xs text-stone-500">
          Synthetic demo data · Fixed fixture dates · Scripted previews and
          illustrative scores
        </p>
      )}
      {error !== null && (
        <div className="mt-5">
          <ErrorState error={error} />
        </div>
      )}
      {preview && (
        <section className="mt-6" aria-label="Review your post">
          <CreatePost
            key={JSON.stringify(preview)}
            preview={preview}
            previewContext={previewContext}
            onCreated={(post) => navigate(`/posts/${post.id}/matches`)}
          />
        </section>
      )}
      <section className="mt-10">
        <div className="section-heading">
          <h2>Find your kind of connection</h2>
          <span>Five ways to feel more connected</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <CategoryCard
            title="Ride Connect"
            description="Share the journey."
            to="/ride"
            icon={CarFront}
            color="#ecede1"
          />
          <CategoryCard
            title="Study Connect"
            description="Make the lightbulb click."
            to="/study"
            icon={BookOpen}
            color="#e9eaf4"
          />
          <CategoryCard
            title="Food Connect"
            description="Good food, better company."
            to="/food"
            icon={Utensils}
            color="#f5e8dc"
          />
          <CategoryCard
            title="Community"
            description="Little things, together."
            to="/community"
            icon={HeartHandshake}
            color="#e5ede6"
          />
          <CategoryCard
            title="Security"
            description="Pause. Check. Protect."
            to="/security"
            icon={ShieldCheck}
            color="#e7edf0"
          />
        </div>
      </section>
      <section className="mt-10">
        <div className="section-heading">
          <h2>Around the campus</h2>
          <Link className="text-button" to="/my-posts">
            My posts <ArrowRight size={14} />
          </Link>
        </div>
        <p className="mb-5 mt-1 text-sm text-stone-500">
          A few open invitations. Yours could be next.
        </p>
        <PostBoard limit={4} />
      </section>
      <div className="journey-note mt-8">
        <HeartHandshake size={21} />
        <p>
          Understand <span>→</span> Extract <span>→</span> Match <span>→</span>{" "}
          Connect <span>→</span> Protect
        </p>
        <span className="ml-auto hidden text-xs sm:block">
          Made for connection.
        </span>
      </div>
    </>
  );
}
