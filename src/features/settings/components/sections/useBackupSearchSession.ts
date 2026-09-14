import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelDatabaseBackupSearch,
  nextDatabaseBackupSearch,
  startDatabaseBackupSearch,
  type DatabaseBackupSearchMatch
} from '../../../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository';

export type BackupSearchStatus = 'idle' | 'starting' | 'searching' | 'match' | 'complete' | 'cancelled' | 'error';

interface MutableCell<T> {
  current: T;
}

function useBackupSearchModel() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [history, setHistory] = useState<DatabaseBackupSearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [status, setStatus] = useState<BackupSearchStatus>('idle');
  const [error, setError] = useState('');
  const [skippedBackupCount, setSkippedBackupCount] = useState(0);
  const sessionIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  return {
    currentIndex, error, generationRef, history, query, sessionIdRef, setCurrentIndex,
    setError, setHistory, setQuery, setSkippedBackupCount, setStatus, setSubmittedQuery,
    skippedBackupCount, status, submittedQuery
  };
}

function useClearBackupSearchSession(
  generationRef: MutableCell<number>,
  sessionIdRef: MutableCell<string | null>
) {
  return useCallback(async () => {
    generationRef.current += 1;
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId) await cancelDatabaseBackupSearch(sessionId).catch(() => undefined);
  }, [generationRef, sessionIdRef]);
}

function useLoadNextBackupMatch(model: ReturnType<typeof useBackupSearchModel>) {
  const { generationRef, sessionIdRef, setCurrentIndex, setError, setHistory, setSkippedBackupCount, setStatus } = model;
  return useCallback(async (sessionId: string, generation: number) => {
    setStatus('searching');
    try {
      const result = await nextDatabaseBackupSearch(sessionId);
      if (generationRef.current !== generation || sessionIdRef.current !== sessionId) return;
      setSkippedBackupCount(result.skipped_backup_count);
      if (result.status === 'complete') return setStatus('complete');
      setHistory((current) => {
        const next = [...current, result.match];
        setCurrentIndex(next.length - 1);
        return next;
      });
      setStatus('match');
    } catch (nextError) {
      if (generationRef.current !== generation) return;
      sessionIdRef.current = null;
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setStatus('error');
    }
  }, [generationRef, sessionIdRef, setCurrentIndex, setError, setHistory, setSkippedBackupCount, setStatus]);
}

function useSubmitBackupSearch(
  model: ReturnType<typeof useBackupSearchModel>,
  clearSession: () => Promise<void>,
  loadNext: (sessionId: string, generation: number) => Promise<void>
) {
  const {
    generationRef, query, sessionIdRef, setCurrentIndex, setError, setHistory, setSkippedBackupCount,
    setStatus, setSubmittedQuery
  } = model;
  return useCallback(async () => {
    const normalized = query.trim();
    if (!normalized) return;
    await clearSession();
    const generation = generationRef.current;
    setError('');
    setHistory([]);
    setCurrentIndex(-1);
    setSkippedBackupCount(0);
    setSubmittedQuery(normalized);
    setStatus('starting');
    try {
      const sessionId = await startDatabaseBackupSearch(normalized);
      if (generationRef.current !== generation) return void cancelDatabaseBackupSearch(sessionId).catch(() => undefined);
      sessionIdRef.current = sessionId;
      await loadNext(sessionId, generation);
    } catch (startError) {
      if (generationRef.current !== generation) return;
      setSubmittedQuery('');
      setError(startError instanceof Error ? startError.message : String(startError));
      setStatus('error');
    }
  }, [clearSession, generationRef, loadNext, query, sessionIdRef, setCurrentIndex, setError, setHistory,
    setSkippedBackupCount, setStatus, setSubmittedQuery]);
}

function useContinueBackupSearch(
  model: ReturnType<typeof useBackupSearchModel>,
  loadNext: (sessionId: string, generation: number) => Promise<void>
) {
  const { generationRef, sessionIdRef, status } = model;
  return useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || status === 'searching' || status === 'starting' || status === 'complete') return;
    await loadNext(sessionId, generationRef.current);
  }, [generationRef, loadNext, sessionIdRef, status]);
}

function useBackupSearchLifecycle(
  open: boolean,
  model: ReturnType<typeof useBackupSearchModel>,
  clearSession: () => Promise<void>
) {
  const {
    setCurrentIndex, setError, setHistory, setQuery, setSkippedBackupCount, setStatus, setSubmittedQuery
  } = model;
  useEffect(() => {
    if (open) return;
    void clearSession();
    setQuery('');
    setHistory([]);
    setCurrentIndex(-1);
    setSkippedBackupCount(0);
    setError('');
    setSubmittedQuery('');
    setStatus('idle');
  }, [clearSession, open, setCurrentIndex, setError, setHistory, setQuery, setSkippedBackupCount, setStatus,
    setSubmittedQuery]);
  useEffect(() => () => { void clearSession(); }, [clearSession]);
}

export function useBackupSearchSession(open: boolean) {
  const model = useBackupSearchModel();
  const clearSession = useClearBackupSearchSession(model.generationRef, model.sessionIdRef);
  const loadNext = useLoadNextBackupMatch(model);
  const submit = useSubmitBackupSearch(model, clearSession, loadNext);
  const continueSearch = useContinueBackupSearch(model, loadNext);
  useBackupSearchLifecycle(open, model, clearSession);
  const { setCurrentIndex, setHistory, setSkippedBackupCount, setStatus, setSubmittedQuery } = model;
  const select = useCallback((index: number) => {
    if (index >= 0 && index < model.history.length) setCurrentIndex(index);
  }, [model.history.length, setCurrentIndex]);
  const cancel = useCallback(async () => {
    await clearSession();
    setHistory([]);
    setCurrentIndex(-1);
    setSkippedBackupCount(0);
    setSubmittedQuery('');
    setStatus('cancelled');
  }, [clearSession, setCurrentIndex, setHistory, setSkippedBackupCount, setStatus, setSubmittedQuery]);
  return {
    cancel,
    continueSearch,
    current: model.currentIndex >= 0 ? model.history[model.currentIndex] ?? null : null,
    currentIndex: model.currentIndex,
    error: model.error,
    history: model.history,
    query: model.query,
    select,
    setQuery: model.setQuery,
    skippedBackupCount: model.skippedBackupCount,
    status: model.status,
    submittedQuery: model.submittedQuery,
    submit
  };
}
