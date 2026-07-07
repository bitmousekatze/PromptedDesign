import { useState, useEffect } from 'react';

/**
 * Debounce a value by the specified delay (in ms).
 * Returns the debounced value which only updates after the delay.
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
