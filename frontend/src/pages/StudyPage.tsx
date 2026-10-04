// Reserved for Person 2. Extend this page using the shared client, CreatePost, PostBoard, and MatchCard.
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { PostBoard } from "../components/PostBoard";

export default function StudyPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEARN TOGETHER</p>
          <h1>Study Connect</h1>
          <p>A course, a tricky topic, a fresh way of looking at it.</p>
        </div>
        <BookOpen size={36} className="text-stone-400" />
      </div>
      <div className="notice mb-7">
        The dedicated Study workflow is reserved for Person 2. Browse fixture
        posts below, or{" "}
        <Link className="underline" to="/">
          preview a Study request from the dashboard
        </Link>
        .
      </div>
      <PostBoard category="STUDY" />
    </>
  );
}
