import { useId, useLayoutEffect, useSyncExternalStore, type ComponentProps } from 'react';

import { AppDialog } from './Dialog';

let waiting: string[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => waiting[0] ?? null;
const notify = () => listeners.forEach((listener) => listener());

// Only independent notices participate; task dialogs can still ask for confirmation.
export function AppNoticeDialog({ open, ...props }: ComponentProps<typeof AppDialog> & { open: boolean }) {
  const id = useId();
  const first = useSyncExternalStore(subscribe, snapshot, () => null);
  useLayoutEffect(() => {
    if (!open) return;
    waiting = [...waiting, id];
    notify();
    return () => {
      waiting = waiting.filter((entry) => entry !== id);
      notify();
    };
  }, [id, open]);
  return <AppDialog {...props} open={open && first === id} />;
}
