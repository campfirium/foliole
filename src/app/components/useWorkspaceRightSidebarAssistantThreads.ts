import { useEffect, useState } from 'react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import {
  listAssistantThreadIndex,
  removeAssistantThreadFromHistory
} from '../../shared/platform/assistantRuntime';

import { upsertRecord } from './workspaceRightSidebarAssistantPanelModel';

export type AssistantThreadIndexError = 'loadFailed' | 'removeFailed';

export function useWorkspaceRightSidebarAssistantThreads(enabled: boolean) {
  const [records, setRecords] = useState<NativeAssistantThreadIndexRecord[]>([]);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AssistantThreadIndexError | null>(null);
  const [removingThreadId, setRemovingThreadId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setRecords([]);
      selectThreadId(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void loadAssistantThreads({ isActive: () => active, selectThreadId, setError, setLoading, setRecords });
    return () => {
      active = false;
    };
  }, [enabled, reloadToken]);

  return {
    removeRecord: (record: NativeAssistantThreadIndexRecord) =>
      removeAssistantThreadRecord({ record, selectThreadId, setError, setRecords, setRemovingThreadId }),
    error,
    loading,
    records,
    removingThreadId,
    reload: () => setReloadToken((current) => current + 1),
    selectedThreadId,
    selectThreadId,
    upsertRecord: (record: NativeAssistantThreadIndexRecord) =>
      setRecords((current) => upsertRecord(current, record))
  };
}

async function loadAssistantThreads(args: {
  isActive: () => boolean;
  selectThreadId: (updater: (current: string | null) => string | null) => void;
  setError: (error: AssistantThreadIndexError | null) => void;
  setLoading: (loading: boolean) => void;
  setRecords: (records: NativeAssistantThreadIndexRecord[]) => void;
}) {
  try {
    const nextRecords = await listAssistantThreadIndex();
    if (!nextRecords) throw new Error('assistant_thread_index_unavailable');
    if (!args.isActive()) return;
    args.setRecords(nextRecords);
    args.selectThreadId((current) => selectThreadIdFromRecords(current, nextRecords));
  } catch {
    if (!args.isActive()) return;
    args.setRecords([]);
    args.selectThreadId(() => null);
    args.setError('loadFailed');
  } finally {
    if (args.isActive()) args.setLoading(false);
  }
}

async function removeAssistantThreadRecord(args: {
  record: NativeAssistantThreadIndexRecord;
  selectThreadId: (updater: (current: string | null) => string | null) => void;
  setError: (error: AssistantThreadIndexError | null) => void;
  setRecords: (updater: (current: NativeAssistantThreadIndexRecord[]) => NativeAssistantThreadIndexRecord[]) => void;
  setRemovingThreadId: (threadId: string | null) => void;
}) {
  args.setRemovingThreadId(args.record.providerThreadId);
  args.setError(null);
  try {
    const removed = await removeAssistantThreadFromHistory({
      provider: args.record.provider,
      providerThreadId: args.record.providerThreadId
    });
    if (!removed) throw new Error('assistant_thread_remove_unavailable');
    args.setRecords((current) => removeRecordFromList(current, args.record, args.selectThreadId));
    return true;
  } catch {
    args.setError('removeFailed');
    return false;
  } finally {
    args.setRemovingThreadId(null);
  }
}

function removeRecordFromList(
  current: NativeAssistantThreadIndexRecord[],
  record: NativeAssistantThreadIndexRecord,
  selectThreadId: (updater: (current: string | null) => string | null) => void
) {
  const nextRecords = current.filter((item) => item.providerThreadId !== record.providerThreadId);
  selectThreadId((currentThreadId) =>
    currentThreadId === record.providerThreadId ? selectThreadIdFromRecords(null, nextRecords) : currentThreadId
  );
  return nextRecords;
}

function selectThreadIdFromRecords(
  current: string | null,
  records: NativeAssistantThreadIndexRecord[]
): string | null {
  if (current && records.some((record) => record.providerThreadId === current)) return current;
  return null;
}
