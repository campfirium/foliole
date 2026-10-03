import { useCallback, useEffect, useRef, useState } from 'react';

import type { CompanionCaptureTextSaveError, CompanionCaptureTextSaveResult } from './companionCaptureTextController';

function useCaptureDraftState(open: boolean) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<CompanionCaptureTextSaveError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [retryRefresh, setRetryRefresh] = useState<(() => Promise<unknown>) | null>(null);
  const attempt = useRef({ session: 0, busy: false });
  const resetDraft = useCallback(() => {
    attempt.current = { session: attempt.current.session + 1, busy: false };
    setDraft('');
    setError(null);
    setIsSaving(false);
    setRetryRefresh(null);
  }, []);
  useEffect(() => { if (!open) resetDraft(); }, [open, resetDraft]);
  useEffect(() => () => { attempt.current.session += 1; }, []);

  const handleDraftChange = (value: string) => {
    if (attempt.current.busy || retryRefresh) return;
    setDraft(value);
    setError(null);
  };
  return {
    draft, error, isSaving, retryRefresh, attempt, resetDraft,
    setError, setIsSaving, setRetryRefresh, handleDraftChange
  };
}

export function useCompanionCaptureDraft(props: {
  onSave(text: string): Promise<CompanionCaptureTextSaveResult>;
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  const {
    draft, error, isSaving, retryRefresh, attempt, resetDraft,
    setError, setIsSaving, setRetryRefresh, handleDraftChange
  } = useCaptureDraftState(props.open);
  const handleOpenChange = (open: boolean) => {
    if (!open) resetDraft();
    props.onOpenChange(open);
  };
  const handleSave = async () => {
    if (attempt.current.busy || !draft.trim()) return;
    const session = attempt.current.session;
    attempt.current.busy = true;
    setIsSaving(true);
    setError(null);
    try {
      let result: CompanionCaptureTextSaveResult | null = null;
      if (retryRefresh) await retryRefresh();
      else result = await props.onSave(draft);
      if (session !== attempt.current.session) return;
      if (result && 'error' in result) setError(result.error);
      else if (result?.retryRefresh) {
        const retry = result.retryRefresh;
        setRetryRefresh(() => retry);
      } else handleOpenChange(false);
    } catch {
      if (session === attempt.current.session && !retryRefresh) setError('save-failed');
    } finally {
      if (session === attempt.current.session) {
        attempt.current.busy = false;
        setIsSaving(false);
      }
    }
  };
  return {
    draft, error, isSaving, isSaved: Boolean(retryRefresh),
    canSave: draft.trim().length > 0 && !isSaving,
    handleDraftChange, handleOpenChange, handleSave
  };
}
