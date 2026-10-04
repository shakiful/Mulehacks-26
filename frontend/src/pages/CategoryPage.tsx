import { useState } from "react";
import { Plus, Utensils, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Category } from "../api/types";
import { CreatePost } from "../components/CreatePost";
import { PostBoard } from "../components/PostBoard";
import { DiningMenus } from "../components/DiningMenus";
import { categoryNames } from "../lib/posts";

const descriptions: Record<Category, string> = {
  RIDE: "A shared route. A little more company. Offer a seat or ask for a lift.",
  STUDY: "Learn something new, together.",
  RESTAURANT:
    "Pull up a chair. Find a dining partner, a food trip, or a group order.",
  COMMUNITY:
    "Borrow a calculator, lend a hand, or find someone to join your next activity.",
};
export function CategoryPage({ category }: { category: Category }) {
  const [creating, setCreating] = useState(false);
  const [showMenus, setShowMenus] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIFE IS BETTER TOGETHER</p>
          <h1>{categoryNames[category]}</h1>
          <p>{descriptions[category]}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {category === "RESTAURANT" && <button
            className="button-secondary"
            aria-expanded={showMenus}
            aria-controls="dining-menus"
            onClick={() => setShowMenus(!showMenus)}
          >
            <Utensils size={16} />
            {showMenus ? "Hide dining menu" : "Check dining menu"}
          </button>}
          <button
          className="button-primary"
          onClick={() => setCreating(!creating)}
        >
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? "Close form" : "Create a post"}
          </button>
        </div>
      </div>
      {category === "RESTAURANT" && showMenus && <DiningMenus />}
      {creating && (
        <div className="mb-8">
          <CreatePost
            category={category}
            onCreated={(post) => navigate(`/posts/${post.id}/matches`)}
          />
        </div>
      )}
      {category === "RESTAURANT" && (
        <p className="notice mb-6">
          Connecting expresses interest. It does not place an order or reserve
          group capacity.
        </p>
      )}
      <div className="section-heading mb-5">
        <h2>Open campus posts</h2>
        <span>Your campus community</span>
      </div>
      <PostBoard category={category} />
    </>
  );
}
