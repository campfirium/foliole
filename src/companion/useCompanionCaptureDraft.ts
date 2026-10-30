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

interface CaptureDraftProps {
  draftScope: string;
  onSave(text: string): Promise<CompanionCaptureTextSaveResult>;
  onClipboardCreated?(nodeId: string): void;
  onOpenChange(open: boolean): void;
  open: boolean;
}

export function useCompanionCaptureDraft(props: CaptureDraftProps) {
  const state = useCaptureDraftState(props.open, props.draftScope);
  const { draft, error, isSaving, retryRefresh, resetDraft, preserveOnClose, handleDraftChange } = state;
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
  const saveText = createCaptureTextSaver(props, state, handleOpenChange);
  return {
    draft, error, isSaving, isSaved: Boolean(retryRefresh),
    canSave: (Boolean(retryRefresh) || draft.trim().length > 0) && !isSaving,
    handleDraftChange, handleOpenChange, handleSave: () => saveText(draft, false),
    handleSaveClipboard: (text: string) => saveText(text, true), closeForSystemBack
  };
}

function createCaptureTextSaver(props: CaptureDraftProps, state: ReturnType<typeof useCaptureDraftState>,
  handleOpenChange: (open: boolean) => void) {
  const { draft, retryRefresh, attempt, preserveOnClose, setError, setIsSaving, setRetryRefresh } = state;
  return async (text: string, clipboard: boolean) => {
    if (attempt.current.busy || (!retryRefresh && !text.trim())) return;
    const session = attempt.current.session;
    const complete = (nodeId: string) => {
      if (session !== attempt.current.session) return;
      if (clipboard) {
        persistCaptureBackDraft(props.draftScope, draft);
        preserveOnClose.current = true;
        setRetryRefresh(null);
        props.onOpenChange(false);
        props.onClipboardCreated?.(nodeId);
      } else handleOpenChange(false);
    };
    attempt.current.busy = true;
    setIsSaving(true);
    setError(null);
    try {
      let result: CompanionCaptureTextSaveResult | null = null;
      if (retryRefresh) { await retryRefresh(); return; }
      else result = await props.onSave(text);
      if (session !== attempt.current.session) return;
      if (result && 'error' in result) setError(result.error);
      else if (result?.retryRefresh) {
        const retry = result.retryRefresh;
        const nodeId = result.nodeId;
        setRetryRefresh(() => async () => { await retry(); complete(nodeId); });
      } else if (result && 'nodeId' in result) complete(result.nodeId);
    } catch {
      if (session === attempt.current.session && !retryRefresh) setError('save-failed');
    } finally {
      if (session === attempt.current.session) {
        attempt.current.busy = false;
        setIsSaving(false);
      }
    }
  };
}
