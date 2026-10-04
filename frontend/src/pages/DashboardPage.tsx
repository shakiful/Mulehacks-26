import {
  ArrowRight,
  BookOpen,
  CarFront,
  HeartHandshake,
  Utensils,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CategoryCard } from "../components/CategoryCard";
import { PostBoard } from "../components/PostBoard";
import { PostPreview } from "../components/PostPreview";

export function DashboardPage() {
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
          UCM · Campus commons
        </span>
      </div>
      <PostPreview />
      <section className="mt-10">
        <div className="section-heading">
          <h2>Find your kind of connection</h2>
          <span>Four ways to feel more connected</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
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
