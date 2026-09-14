export type FormatCleanupRequest = 'clean' | 'configure';

const listeners = new Set<(request: FormatCleanupRequest) => void>();

export function requestFormatCleanup(request: FormatCleanupRequest) {
  for (const listener of listeners) listener(request);
}

export function subscribeFormatCleanupRequests(listener: (request: FormatCleanupRequest) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
