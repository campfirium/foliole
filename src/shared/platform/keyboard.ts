export type KeydownUnlisten = () => void;

type KeydownHandler = (event: KeyboardEvent) => void;

type KeydownEntry = {
  handler: KeydownHandler;
  id: number;
};

let nextKeydownEntryId = 1;
let isWindowKeydownListening = false;
const keydownEntries: KeydownEntry[] = [];
const escapeEntries: KeydownEntry[] = [];

function removeEntry(entries: KeydownEntry[], id: number) {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    entries.splice(index, 1);
  }
}

function stopWindowKeydownIfIdle() {
  if (!isWindowKeydownListening || keydownEntries.length || escapeEntries.length || typeof window === 'undefined') {
    return;
  }
  window.removeEventListener('keydown', dispatchWindowKeydown);
  isWindowKeydownListening = false;
}

function consumeEscape(event: KeyboardEvent) {
  const entry = escapeEntries[escapeEntries.length - 1];
  if (!entry) {
    return false;
  }
  entry.handler(event);
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  return true;
}

function dispatchWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && consumeEscape(event)) {
    return;
  }
  for (const entry of [...keydownEntries]) {
    entry.handler(event);
  }
}

function listenWindowKeydown() {
  if (isWindowKeydownListening || typeof window === 'undefined') {
    return;
  }
  window.addEventListener('keydown', dispatchWindowKeydown);
  isWindowKeydownListening = true;
}

function registerWindowKeydown(entries: KeydownEntry[], handler: KeydownHandler): KeydownUnlisten {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const id = nextKeydownEntryId;
  nextKeydownEntryId += 1;
  entries.push({ handler, id });
  listenWindowKeydown();
  return () => {
    removeEntry(entries, id);
    stopWindowKeydownIfIdle();
  };
}

export function onWindowKeydown(handler: (event: KeyboardEvent) => void): KeydownUnlisten {
  return registerWindowKeydown(keydownEntries, handler);
}

export function onWindowEscape(handler: (event: KeyboardEvent) => void): KeydownUnlisten {
  return registerWindowKeydown(escapeEntries, handler);
}
