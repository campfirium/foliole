// Read structurally: companion sync code compiled for the desktop main process also imports this module.
interface DesktopAttachmentAvailabilityBridge {
  onAttachmentResourceAvailable?: (handler: (storageKey: string) => void) => () => void;
}

const listeners = new Map<string, Set<() => void>>();
let desktopAvailabilityConnected = false;

// Desktop publishes verified bytes in the main process, so the shell forwards each publication here.
function connectDesktopAvailability() {
  if (desktopAvailabilityConnected) return;
  const bridge = (globalThis as { electronAPI?: DesktopAttachmentAvailabilityBridge }).electronAPI;
  const onAvailable = bridge?.onAttachmentResourceAvailable;
  if (!onAvailable) return;
  onAvailable(notifyAttachmentResourceAvailable);
  desktopAvailabilityConnected = true;
}

export function subscribeAttachmentResourceAvailable(storageKey: string, listener: () => void) {
  connectDesktopAvailability();
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
