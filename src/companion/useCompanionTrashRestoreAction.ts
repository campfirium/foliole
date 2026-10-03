import { useEffect, useRef, useState } from 'react';

import { CompanionTrashRestoreRefreshError } from './companionTrashController';

export function useCompanionTrashRestoreAction(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onRestoreFromTrash?: (() => Promise<void> | void) | undefined;
}) {
  const [error, setError] = useState<'write' | 'refresh' | null>(null);
  const [pending, setPending] = useState(false);
  const lifetime = useRef({ generation: 0, busy: false });
  useEffect(() => {
    lifetime.current.generation++;
    return () => { lifetime.current.generation++; };
  }, [props.open]);
  async function restore() {
    if (lifetime.current.busy) return;
    const generation = lifetime.current.generation;
    lifetime.current.busy = true;
    setPending(true);
    try {
      await props.onRestoreFromTrash?.();
      if (generation === lifetime.current.generation) { setError(null); props.onOpenChange(false); }
    } catch (failure) {
      if (generation === lifetime.current.generation) {
        setError(failure instanceof CompanionTrashRestoreRefreshError ? 'refresh' : 'write');
      }
    } finally {
      lifetime.current.busy = false;
      setPending(false);
    }
  }
  return { error, pending, restore };
}
