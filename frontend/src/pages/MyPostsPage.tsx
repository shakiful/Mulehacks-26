import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { PostBoard } from "../components/PostBoard";

export function MyPostsPage() {
  const location = useLocation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WHAT YOU PUT INTO THE WORLD</p>
          <h1>Your open posts</h1>
          <p>Edit your details, find matches, or mark your need completed.</p>
        </div>
        <Link className="button-primary" to="/">
          <Plus size={16} />
          New connection
        </Link>
      </div>
      {location.state?.postSaved === true && (
        <p role="status" className="notice mb-6">Post updated. Your changes are saved.</p>
      )}
      <PostBoard ownOnly />
    </>
  );
}
