import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader (a real backend call) and tracks loading/error/data
 * state. Replaces the old synchronous `useStore(() => mockFn())` pattern
 * now that data actually comes from network requests, not an in-memory
 * object. `deps` works like useEffect's dependency array; pass a stable
 * function (e.g. via useCallback) if it depends on route params.
 *
 * `refetch()` is exposed so a page can manually reload after a mutation
 * (join queue, add walk-in, etc.) instead of guessing at optimistic
 * updates that might not match what the server actually persisted.
 */
export function useAsync(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, refetch: run };
}
