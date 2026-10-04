import { useEffect, useState, type DependencyList } from "react";

export function useResource<T>(
  load: () => Promise<T>,
  dependencies: DependencyList,
) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    data: T | null;
    error: unknown;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  useEffect(() => {
    let active = true;
    setState({ data: null, error: null, loading: true });
    load()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error, loading: false });
      });
    return () => {
      active = false;
    };
    // Callers supply the complete resource key; stale responses are discarded on key changes.
  }, [...dependencies, revision]);
  return { ...state, reload: () => setRevision((value) => value + 1) };
}
