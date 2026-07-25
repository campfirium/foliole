import { useEffect, useState } from 'react';

import {
  loadCompanionNodeTextAlternative,
  updateCompanionNodeTextAlternativeStatus
} from '../shared/platform/companionNodeTextAlternativeRepository';

export function useCompanionNodeTextAlternative(args: {
  nodeId: string;
  onSetAsBody?: (nodeId: string, content: string) => Promise<void>;
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
      setAlternative(null);
      setOpen(false);
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
      await args.onSetAsBody(args.nodeId, alternative.body_text);
      await updateCompanionNodeTextAlternativeStatus(alternative.alternative_id, 'promoted');
      setAlternative(null);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { alternative, busy, dismiss, error, open, setAsBody, setOpen };
}
