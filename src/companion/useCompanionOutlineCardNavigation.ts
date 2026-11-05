import { useEffect, useRef, useState } from 'react';

import type { DocumentOutlineNavigation } from '../features/editor/model/documentOutlineNavigation';

import type { CompanionReadingActivity } from './companionReadingActivity';

export function useCompanionOutlineCardNavigation(args: {
  activity?: CompanionReadingActivity | undefined;
  entries: DocumentOutlineNavigation['entries'];
  nodeId: string;
  onOpenNode?: ((nodeId: string) => void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const session = useRef<object | null>(null);
  const latest = useRef(args);
  latest.current = args;
  useEffect(() => {
    session.current = {};
    pending.current = false;
    setBusy(false);
    setError(false);
    return () => { session.current = null; };
  }, [args.nodeId]);

  async function open(nodeId: string) {
    if (pending.current || latest.current.activity?.editing || !latest.current.onOpenNode) return false;
    const started = session.current;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      await latest.current.activity?.flush();
      if (!started || session.current !== started || latest.current.activity?.editing ||
        latest.current.entries[nodeId]?.action !== 'card') return false;
      latest.current.onOpenNode?.(nodeId);
      return true;
    } catch {
      if (session.current === started) setError(true);
      return false;
    } finally {
      if (session.current === started) { pending.current = false; setBusy(false); }
    }
  }
  return { open, busy, error };
}
