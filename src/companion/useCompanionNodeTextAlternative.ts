import { useEffect, useState } from 'react';

import {
  loadCompanionNodeTextAlternative,
  updateCompanionNodeTextAlternativeStatus
} from '../shared/platform/companion/runtime/companionNodeTextAlternativeRepository';

export function useCompanionNodeTextAlternative(args: {
  nodeId: string;
  onSetAsBody?: (nodeId: string, content: string) => Promise<unknown>;
}) {
  const [alternative, setAlternative] = useState<Awaited<ReturnType<typeof loadCompanionNodeTextAlternative>>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCompanionNodeTextAlternative(args.nodeId)
      .then((value) => { if (active) setAlternative(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [args.nodeId]);

  async function dismiss() {
    if (!alternative || busy) return;
    setBusy(true);
    setError(false);
    try {
      await updateCompanionNodeTextAlternativeStatus(alternative.alternative_id, 'dismissed');
      const next = await loadCompanionNodeTextAlternative(args.nodeId);
      setAlternative(next);
      if (!next) setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function setAsBody() {
    if (!alternative || !args.onSetAsBody || busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await updateCompanionNodeTextAlternativeStatus(alternative.alternative_id, 'promoted');
      if (result.status !== 'promoted') throw new Error('text_alternative_unavailable');
      await args.onSetAsBody(args.nodeId, alternative.body_text);
      const next = await loadCompanionNodeTextAlternative(args.nodeId);
      setAlternative(next);
      if (!next) setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function selectAlternative(id: string) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try { setAlternative(await loadCompanionNodeTextAlternative(args.nodeId, id)); }
    catch { setError(true); }
    finally { setBusy(false); }
  }

  return { selectAlternative, alternative, busy, dismiss, error, open, setAsBody, setOpen };
}
