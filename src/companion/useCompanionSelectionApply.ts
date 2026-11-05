import { useEffect, useRef, useState } from 'react';

import { resolveLongClozeGuardAction } from '../shared/selectionClozeGuard';
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
  const [guardPayload, setGuardPayload] = useState<SelectionCommandPayload | null>(null);
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
    error, saving, guardPayload, saved: Boolean(recovery.current),
    apply: (kind: CompanionSelectionAnnotationKind, note?: string) => {
      if (recovery.current || pending.current || guardPayload) return;
      const payload = args.resolvePayload();
      if (!payload) return;
      const action = kind === 'cloze' ? resolveLongClozeGuardAction(payload) : kind;
      if (action === 'remind') { setGuardPayload(payload); return; }
      void run(() => args.onApply(action, payload, note));
    },
    cancelGuard: () => { setGuardPayload(null); args.onClose(); },
    confirmGuard: (kind: 'cloze' | 'highlight') => {
      if (!guardPayload || pending.current || recovery.current) return;
      const payload = guardPayload;
      void run(async () => {
        await args.onApply(kind, payload);
        if (mounted.current) setGuardPayload(null);
      });
    },
    retryRefresh: () => { if (recovery.current) void run(recovery.current.retryRefresh); }
  };
}
