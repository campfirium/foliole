const listeners = new Map<string, Set<() => void>>();

export function subscribeAttachmentResourceAvailable(storageKey: string, listener: () => void) {
  let subscribers = listeners.get(storageKey);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(storageKey, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(storageKey);
  };
}

/** Publish only after the resource bytes have committed successfully. */
export function notifyAttachmentResourceAvailable(storageKey: string) {
  for (const listener of listeners.get(storageKey) ?? []) listener();
}
