import { useState, useEffect, useCallback, useRef } from 'react';

export function usePolling(fetchFn, interval = 5000) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  const load = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, interval);
    return () => clearInterval(timer);
  }, [load, interval]);

  return { data, loading, error, refresh: load };
}
