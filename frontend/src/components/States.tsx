import { AlertCircle, ArrowRight, LoaderCircle, Sprout } from "lucide-react";
import { errorMessage } from "../api/errors";

export function LoadingState({
  label = "Finding campus connections…",
}: {
  label?: string;
}) {
  return (
    <div role="status" className="state-panel">
      <LoaderCircle className="animate-spin text-emerald-800" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-panel">
      <AlertCircle size={20} />
      <div>
        <p>{errorMessage(error)}</p>
        {retry && (
          <button className="text-button mt-2" onClick={retry}>
            Try again <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
export function EmptyState({
  title = "A little quiet here, for now.",
  description = "Start a post and give your next connection a place to begin.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="state-panel flex-col text-center">
      <span className="empty-icon">
        <Sprout size={28} />
      </span>
      <h3 className="font-semibold text-stone-800">{title}</h3>
      <p className="max-w-sm text-sm">{description}</p>
    </div>
  );
}
