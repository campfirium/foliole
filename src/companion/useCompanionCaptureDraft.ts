import { useCallback, useEffect, useRef, useState } from 'react';

import { clearCaptureBackDraft, persistCaptureBackDraft, readCaptureBackDraft } from './companionCaptureDraftStorage';
import type { CompanionCaptureTextSaveError, CompanionCaptureTextSaveResult } from './companionCaptureTextController';

function useCaptureDraftState(open: boolean, draftScope: string) {
  const [draft, setDraft] = useState(() => readCaptureBackDraft(draftScope));
  const [error, setError] = useState<CompanionCaptureTextSaveError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [retryRefresh, setRetryRefresh] = useState<(() => Promise<unknown>) | null>(null);
  const attempt = useRef({ session: 0, busy: false });
  const preserveOnClose = useRef(false);
  const wasOpen = useRef(open);
  const resetDraft = useCallback(() => {
    attempt.current = { session: attempt.current.session + 1, busy: false };
    setDraft('');
    setError(null);
    setIsSaving(false);
    setRetryRefresh(null);
    clearCaptureBackDraft(draftScope);
  }, [draftScope]);
  useEffect(() => {
    if (wasOpen.current && !open && !preserveOnClose.current) resetDraft();
    if (open) preserveOnClose.current = false;
    wasOpen.current = open;
  }, [open, resetDraft]);
  useEffect(() => () => { attempt.current.session += 1; }, []);

  const handleDraftChange = (value: string) => {
    if (attempt.current.busy || retryRefresh) return;
    setDraft(value);
    setError(null);
  };
  return {
    draft, error, isSaving, retryRefresh, attempt, resetDraft, preserveOnClose,
    setError, setIsSaving, setRetryRefresh, handleDraftChange
  };
}

export function useCompanionCaptureDraft(props: {
  draftScope: string;
  onSave(text: string): Promise<CompanionCaptureTextSaveResult>;
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  const {
    draft, error, isSaving, retryRefresh, attempt, resetDraft, preserveOnClose,
    setError, setIsSaving, setRetryRefresh, handleDraftChange
  } = useCaptureDraftState(props.open, props.draftScope);
  const handleOpenChange = (open: boolean) => {
    if (!open) resetDraft();
    props.onOpenChange(open);
  };
  const closeForSystemBack = () => {
    if (isSaving) return;
    if (retryRefresh) return handleOpenChange(false);
    if (!persistCaptureBackDraft(props.draftScope, draft)) return;
    preserveOnClose.current = true;
    props.onOpenChange(false);
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
    handleDraftChange, handleOpenChange, handleSave, closeForSystemBack
  };
}
