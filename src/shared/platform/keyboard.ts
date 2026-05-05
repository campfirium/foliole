export type KeydownUnlisten = () => void;

export function onWindowKeydown(handler: (event: KeyboardEvent) => void): KeydownUnlisten {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
}
