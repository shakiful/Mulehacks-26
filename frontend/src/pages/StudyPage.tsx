// Person 2's dedicated page uses the shared dashboard preview and post components.
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { PostBoard } from "../components/PostBoard";
import { PostPreview } from "../components/PostPreview";

export default function StudyPage() {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEARN TOGETHER</p>
          <h1>Study Connect</h1>
          <p>A course, a tricky topic, a fresh way of looking at it.</p>
        </div>
        <button className="button-primary" aria-expanded={creating} aria-controls="study-post-form"
          onClick={() => setCreating(!creating)}>
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? "Close form" : "Create study post"}
        </button>
      </div>
      {creating && <div id="study-post-form" className="mb-8">
        <PostPreview category="STUDY" />
      </div>}
      <div className="section-heading mb-5">
        <h2>Open study posts</h2>
        <span>Learn with your campus community</span>
      </div>
      <PostBoard category="STUDY" />
    </>
  );
}
