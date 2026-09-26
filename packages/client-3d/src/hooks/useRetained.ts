import { useRef } from "react";

/**
 * The last non-null value seen. A panel that is fading out keeps showing what it showed,
 * instead of going blank the instant its data is cleared. The panel unmounts when the fade
 * ends, which is what releases the retained value.
 */
export function useRetained<Value>(value: Value | null): Value | null {
  const retained = useRef(value);
  if (value !== null) retained.current = value;
  return retained.current;
}
