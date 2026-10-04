import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { PostBoard } from "../components/PostBoard";

export function MyPostsPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WHAT YOU PUT INTO THE WORLD</p>
          <h1>Your open posts</h1>
          <p>Find matches or mark your need completed.</p>
        </div>
        <Link className="button-primary" to="/">
          <Plus size={16} />
          New connection
        </Link>
      </div>
      <PostBoard ownOnly />
    </>
  );
}
