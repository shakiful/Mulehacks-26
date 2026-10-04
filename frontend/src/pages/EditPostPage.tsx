import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CreatePost } from "../components/CreatePost";
import { ErrorState, LoadingState } from "../components/States";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { categoryNames } from "../lib/posts";

export function EditPostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const { api, userId, scenario } = useApi();
  const navigate = useNavigate();
  const resource = useResource(() => api.getPost(postId), [api, userId, postId, scenario]);
  const post = resource.data;
  const accessError = post && (
    post.author.id !== userId ? new Error("Only the author can edit this post.")
    : post.status !== "OPEN" ? new Error("Only open posts can be edited.")
    : null
  );

  return (
    <>
      <Link className="text-button mb-5" to="/my-posts">
        <ArrowLeft size={14} /> My posts
      </Link>
      {resource.loading ? <LoadingState label="Loading your post…" />
        : resource.error ? <ErrorState error={resource.error} retry={resource.reload} />
        : accessError ? <ErrorState error={accessError} />
        : post && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">KEEP YOUR CONNECTION UP TO DATE</p>
                <h1>Edit {categoryNames[post.category]} post</h1>
                <p>Your current details are ready to update.</p>
              </div>
            </div>
            <CreatePost key={post.id} initialPost={post}
              onCancel={() => navigate("/my-posts")}
              onCreated={() => navigate("/my-posts", { replace: true, state: { postSaved: true } })} />
          </>
        )}
    </>
  );
}
