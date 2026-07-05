import { getElectronAPI, type NativeKeyboardInputPayload } from './electronApi';

export type KeydownUnlisten = () => void;

type KeydownHandler = (event: KeyboardEvent) => boolean | void;

type KeydownEntry = {
  handler: KeydownHandler;
  id: number;
};

let nextKeydownEntryId = 1;
let isWindowEscapeListening = false;
let isDocumentEscapeListening = false;
let isWindowKeydownCaptureListening = false;
let isWindowKeydownListening = false;
let lastConsumedDomEscapeAt = 0;
let nativeEscapeFallbackId = 0;
let unlistenNativeKeyboardInput: KeydownUnlisten | null = null;
const keydownEntries: KeydownEntry[] = [];
const keydownCaptureEntries: KeydownEntry[] = [];
const escapeEntries: KeydownEntry[] = [];
const priorityEscapeEntries: KeydownEntry[] = [];

function removeEntry(entries: KeydownEntry[], id: number) {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    entries.splice(index, 1);
  }
}

function stopWindowKeydownIfIdle() {
  if (typeof window === 'undefined') {
    return;
  }
  if (isWindowKeydownListening && keydownEntries.length === 0) {
    window.removeEventListener('keydown', dispatchWindowKeydown);
    isWindowKeydownListening = false;
  }
  if (isWindowKeydownCaptureListening && keydownCaptureEntries.length === 0) {
    window.removeEventListener('keydown', dispatchWindowKeydownCapture, true);
    isWindowKeydownCaptureListening = false;
  }
  if (isWindowEscapeListening && escapeEntries.length === 0 && priorityEscapeEntries.length === 0) {
    window.removeEventListener('keydown', dispatchWindowEscapeCapture, true);
    document.removeEventListener('keydown', dispatchWindowEscapeCapture, true);
    unlistenNativeKeyboardInput?.();
    unlistenNativeKeyboardInput = null;
    isWindowEscapeListening = false;
    isDocumentEscapeListening = false;
  }
}

function consumeEscapeEntries(event: KeyboardEvent, entries: KeydownEntry[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || entry.handler(event) === false) {
      continue;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  }
  return false;
}

function consumeEscape(event: KeyboardEvent) {
  return consumeEscapeEntries(event, priorityEscapeEntries) || consumeEscapeEntries(event, escapeEntries);
}

function createNativeEscapeEvent() {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Escape'
  });
}

function dispatchNativeEscapeFallback(payload: NativeKeyboardInputPayload) {
  if (payload.type !== 'keyDown' || payload.key !== 'Escape' || (escapeEntries.length === 0 && priorityEscapeEntries.length === 0)) {
    return;
  }
  const fallbackId = nativeEscapeFallbackId + 1;
  nativeEscapeFallbackId = fallbackId;
  const scheduledAt = Date.now();
  window.setTimeout(() => {
    if (nativeEscapeFallbackId !== fallbackId || lastConsumedDomEscapeAt >= scheduledAt) {
      return;
    }
    consumeEscape(createNativeEscapeEvent());
  }, 0);
}

function dispatchWindowKeydown(event: KeyboardEvent) {
  for (const entry of [...keydownEntries]) {
    entry.handler(event);
  }
}

function dispatchWindowKeydownCapture(event: KeyboardEvent) {
  for (const entry of [...keydownCaptureEntries]) {
    entry.handler(event);
  }
}

function dispatchWindowEscapeCapture(event: KeyboardEvent) {
  if (event.defaultPrevented || event.key !== 'Escape') {
    return;
  }
  if (consumeEscape(event)) {
    lastConsumedDomEscapeAt = Date.now();
  }
}

function listenWindowKeydown() {
  if (isWindowKeydownListening || typeof window === 'undefined') {
    return;
  }
  window.addEventListener('keydown', dispatchWindowKeydown);
  isWindowKeydownListening = true;
}

function listenWindowKeydownCapture() {
  if (isWindowKeydownCaptureListening || typeof window === 'undefined') {
    return;
  }
  window.addEventListener('keydown', dispatchWindowKeydownCapture, true);
  isWindowKeydownCaptureListening = true;
}

function listenNativeKeyboardInput() {
  if (unlistenNativeKeyboardInput || typeof window === 'undefined') {
    return;
  }
  unlistenNativeKeyboardInput = getElectronAPI()?.onNativeKeyboardInput?.(dispatchNativeEscapeFallback) ?? null;
}

function listenWindowEscape() {
  if (typeof window === 'undefined') {
    return;
  }
  if (!isWindowEscapeListening) {
    window.addEventListener('keydown', dispatchWindowEscapeCapture, true);
    isWindowEscapeListening = true;
  }
  if (!isDocumentEscapeListening && typeof document !== 'undefined') {
    document.addEventListener('keydown', dispatchWindowEscapeCapture, true);
    isDocumentEscapeListening = true;
  }
  listenNativeKeyboardInput();
}

function registerWindowKeydown(entries: KeydownEntry[], handler: KeydownHandler): KeydownUnlisten {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const id = nextKeydownEntryId;
  nextKeydownEntryId += 1;
  entries.push({ handler, id });
  if (entries === escapeEntries || entries === priorityEscapeEntries) {
    listenWindowEscape();
  } else if (entries === keydownCaptureEntries) {
    listenWindowKeydownCapture();
  } else {
    listenWindowKeydown();
  }
  return () => {
    removeEntry(entries, id);
    stopWindowKeydownIfIdle();
  };
}

export function onWindowKeydown(handler: (event: KeyboardEvent) => void): KeydownUnlisten {
  return registerWindowKeydown(keydownEntries, handler);
}

export function onWindowKeydownCapture(handler: (event: KeyboardEvent) => void): KeydownUnlisten {
  return registerWindowKeydown(keydownCaptureEntries, handler);
}

export function onWindowEscape(handler: (event: KeyboardEvent) => boolean | void): KeydownUnlisten {
  return registerWindowKeydown(escapeEntries, handler);
}

export function onWindowPriorityEscape(handler: (event: KeyboardEvent) => boolean | void): KeydownUnlisten {
  return registerWindowKeydown(priorityEscapeEntries, handler);
}

export function onNativeEditingEscape(args: {
  exitEditing: () => void;
  isDialogOpen: () => boolean;
  isEditing: () => boolean;
}): KeydownUnlisten {
  return getElectronAPI()?.onNativeKeyboardInput?.((payload) => {
    if (payload.type !== 'keyDown' || payload.key !== 'Escape') {
      return;
    }
    if (args.isDialogOpen() || !args.isEditing()) {
      return;
    }
    args.exitEditing();
  }) ?? (() => undefined);
}
