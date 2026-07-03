import { useCallback, useEffect, useRef, useState } from 'react';

export const COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS = 1200;

interface UseCompanionTopicEditAutosaveArgs {
  canEdit: boolean;
  initialContent: string;
  nodeId: string;
  onSaveContent?: (content: string) => Promise<void>;
  saveDelayMs?: number;
}

function formatSaveError(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save this topic.';
}

function useAutosaveRefs(args: UseCompanionTopicEditAutosaveArgs) {
  const draftRef = useRef(args.initialContent);
  const lastSavedRef = useRef(args.initialContent);
  const savingContentRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveContentRef = useRef(args.onSaveContent);
  const canEditRef = useRef(args.canEdit);

  onSaveContentRef.current = args.onSaveContent;
  canEditRef.current = args.canEdit;

  return { canEditRef, draftRef, lastSavedRef, onSaveContentRef, saveTimerRef, savingContentRef };
}

function useAutosaveCallbacks(args: {
  canEdit: boolean;
  refs: ReturnType<typeof useAutosaveRefs>;
  saveDelayMs: number;
  setError: (error: string | null) => void;
}) {
  const { canEdit, refs, saveDelayMs, setError } = args;
  const clearTimer = useCallback(() => {
    if (refs.saveTimerRef.current) {
      clearTimeout(refs.saveTimerRef.current);
      refs.saveTimerRef.current = null;
    }
  }, [refs.saveTimerRef]);

  const saveContent = useCallback(async (content: string) => {
    if (
      content === refs.lastSavedRef.current
      || content === refs.savingContentRef.current
    ) {
      return;
    }
    refs.savingContentRef.current = content;
    try {
      await refs.onSaveContentRef.current?.(content);
      refs.lastSavedRef.current = content;
      setError(null);
    } catch (saveError) {
      setError(formatSaveError(saveError));
    } finally {
      if (refs.savingContentRef.current === content) {
        refs.savingContentRef.current = null;
      }
    }
  }, [refs.canEditRef, refs.lastSavedRef, refs.onSaveContentRef, refs.savingContentRef, setError]);

  const flushPendingSave = useCallback(async () => {
    clearTimer();
    await saveContent(refs.draftRef.current);
  }, [clearTimer, refs.draftRef, saveContent]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    if (!canEdit || refs.draftRef.current === refs.lastSavedRef.current) {
      return;
    }
    refs.saveTimerRef.current = setTimeout(() => {
      refs.saveTimerRef.current = null;
      void saveContent(refs.draftRef.current);
    }, saveDelayMs);
  }, [canEdit, clearTimer, refs.draftRef, refs.lastSavedRef, refs.saveTimerRef, saveContent, saveDelayMs]);

  return { clearTimer, flushPendingSave, saveContent, scheduleSave };
}

export function useCompanionTopicEditAutosave(args: UseCompanionTopicEditAutosaveArgs) {
  const saveDelayMs = args.saveDelayMs ?? COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS;
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(args.initialContent);
  const refs = useAutosaveRefs(args);
  const {
    clearTimer,
    flushPendingSave,
    saveContent,
    scheduleSave
  } = useAutosaveCallbacks({ canEdit: args.canEdit, refs, saveDelayMs, setError });

  const handleChange = useCallback((nextValue: string) => {
    if (!refs.canEditRef.current) {
      return;
    }
    refs.draftRef.current = nextValue;
    setValue(nextValue);
    scheduleSave();
  }, [refs.canEditRef, refs.draftRef, scheduleSave]);

  useEffect(() => {
    clearTimer();
    refs.draftRef.current = args.initialContent;
    refs.lastSavedRef.current = args.initialContent;
    setValue(args.initialContent);
    setError(null);
  }, [args.initialContent, args.nodeId, clearTimer, refs.draftRef, refs.lastSavedRef]);

  useEffect(() => () => {
    const pendingContent = refs.draftRef.current;
    clearTimer();
    if (refs.canEditRef.current && pendingContent !== refs.lastSavedRef.current) {
      void saveContent(pendingContent);
    }
  }, [clearTimer, refs.canEditRef, refs.draftRef, refs.lastSavedRef, saveContent]);

  useEffect(() => {
    if (!args.canEdit) {
      void flushPendingSave();
    }
  }, [args.canEdit, flushPendingSave]);

  return {
    error,
    flushPendingSave,
    handleChange,
    value
  };
}
