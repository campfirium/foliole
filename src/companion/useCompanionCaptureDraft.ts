import { useCallback, useEffect, useRef, useState } from 'react';

import type { SelectedImportFile } from '../shared/platform/import/selectedImportFile';

import { clearCaptureBackDraft, persistCaptureBackDraft, readCaptureBackDraft } from './companionCaptureDraftStorage';
import type { CompanionCaptureTextSaveError, CompanionCaptureTextSaveResult } from './companionCaptureTextController';

function useCaptureDraftState(open: boolean, draftScope: string) {
  const [draft, setDraft] = useState(() => readCaptureBackDraft(draftScope));
  const [error, setError] = useState<CompanionCaptureTextSaveError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [retryRefresh, setRetryRefresh] = useState<(() => Promise<unknown>) | null>(null);
  const attempt = useRef({ session: 0, busy: false, controller: null as AbortController | null });
  const preserveOnClose = useRef(false);
  const wasOpen = useRef(open);
  const resetDraft = useCallback(() => {
    attempt.current.controller?.abort();
    attempt.current = { session: attempt.current.session + 1, busy: false, controller: null };
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
  useEffect(() => () => { attempt.current.controller?.abort(); attempt.current.session += 1; }, [draftScope]);

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
  onImportFile?(file: SelectedImportFile, signal?: AbortSignal): Promise<CompanionCaptureTextSaveResult>;
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
    handleSaveClipboard: (text: string) => saveText(text, true), closeForSystemBack,
    handleImportFile: (file: SelectedImportFile) => saveText(file, true)
  };
}

function createCaptureTextSaver(props: CaptureDraftProps, state: ReturnType<typeof useCaptureDraftState>,
  handleOpenChange: (open: boolean) => void) {
  const { draft, retryRefresh, attempt, preserveOnClose, setError, setIsSaving, setRetryRefresh } = state;
  return async (text: string | SelectedImportFile, clipboard: boolean) => {
    if (attempt.current.busy || (!retryRefresh && typeof text === 'string' && !text.trim())) return;
    if (typeof text !== 'string' && !persistCaptureBackDraft(props.draftScope, draft)) {
      setError('save-failed');
      return;
    }
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
    const controller = typeof text === 'string' ? null : new AbortController();
    attempt.current.controller = controller;
    setIsSaving(true);
    setError(null);
    try {
      let result: CompanionCaptureTextSaveResult | null = null;
      if (retryRefresh) { await retryRefresh(); return; }
      else if (typeof text === 'string') result = await props.onSave(text);
      else if (props.onImportFile) result = await props.onImportFile(text, controller?.signal);
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
