import { useEffect, useState } from 'react';

const STARTUP_POLL_INTERVAL_MS = 100;
const STARTUP_POLL_TIMEOUT_MS = 3_000;

export function useRuntimeAvailability(isAvailable: () => boolean) {
  const [available, setAvailable] = useState(() => isAvailable());

  useEffect(() => {
    if (available) {
      return;
    }

    let disposed = false;
    const deadline = Date.now() + STARTUP_POLL_TIMEOUT_MS;
    let timerId = 0;

    const poll = () => {
      if (disposed) {
        return;
      }
      if (isAvailable()) {
        setAvailable(true);
        return;
      }
      if (Date.now() >= deadline) {
        return;
      }
      timerId = window.setTimeout(poll, STARTUP_POLL_INTERVAL_MS);
    };

    timerId = window.setTimeout(poll, STARTUP_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearTimeout(timerId);
    };
  }, [available, isAvailable]);

  return available;
}
