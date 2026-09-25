import { useEffect, useState } from 'react';
import { subscribe } from '../api/mockStore';

/**
 * Re-runs `selector` whenever the mock store changes and returns the result.
 * This is the seam where real Socket.IO events plug in later (Section 13 of
 * the UI/UX spec) — components using this hook don't need to change.
 */
export function useStore(selector) {
  const [value, setValue] = useState(selector);

  useEffect(() => {
    setValue(selector());
    const unsubscribe = subscribe(() => setValue(selector()));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}
