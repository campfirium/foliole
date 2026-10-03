import { useEffect, useRef, useState } from 'react';

import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { CompanionSelectionRefreshError } from './companionSelectionRefreshError';

export function useCompanionSelectionApply(args: {
  resolvePayload: () => SelectionCommandPayload | null;
  onApply: (kind: CompanionSelectionAnnotationKind, payload: SelectionCommandPayload, note?: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const mounted = useRef(true);
  const pending = useRef(false);
  const recovery = useRef<CompanionSelectionRefreshError | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function run(action: () => Promise<unknown> | void) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      await action();
      if (mounted.current) args.onClose();
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof CompanionSelectionRefreshError) recovery.current = failure;
      setError(failure);
      console.error('[companion-selection-toolbar] annotation action failed', failure);
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return {
    error, saving, saved: Boolean(recovery.current),
    apply: (kind: CompanionSelectionAnnotationKind, note?: string) => {
      if (recovery.current) return;
      const payload = args.resolvePayload();
      if (payload) void run(() => args.onApply(kind, payload, note));
    },
    retryRefresh: () => { if (recovery.current) void run(recovery.current.retryRefresh); }
  };
}
