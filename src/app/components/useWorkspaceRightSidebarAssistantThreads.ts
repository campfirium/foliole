import { useEffect, useState } from 'react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import {
  deleteAssistantThreadIndex,
  listAssistantThreadIndex
} from '../../shared/platform/assistantRuntime';

import { resolveAssistantLocation, upsertRecord } from './workspaceRightSidebarAssistantPanelModel';

export function useWorkspaceRightSidebarAssistantThreads(
  location: ReturnType<typeof resolveAssistantLocation>,
  enabled: boolean
) {
  const [records, setRecords] = useState<NativeAssistantThreadIndexRecord[]>([]);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removingThreadId, setRemovingThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRecords([]);
      selectThreadId(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void listAssistantThreadIndex({ location }).then((nextRecords) => {
      if (!active) return;
      setRecords(nextRecords ?? []);
      selectThreadId((current) => selectThreadIdFromRecords(current, nextRecords ?? []));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [enabled, location]);

  return {
    deleteRecord: async (record: NativeAssistantThreadIndexRecord) => {
      setRemovingThreadId(record.providerThreadId);
      try {
        await deleteAssistantThreadIndex({ providerThreadId: record.providerThreadId });
        setRecords((current) => {
          const nextRecords = current.filter((item) => item.providerThreadId !== record.providerThreadId);
          selectThreadId((currentThreadId) =>
            currentThreadId === record.providerThreadId
              ? selectThreadIdFromRecords(null, nextRecords)
              : currentThreadId
          );
          return nextRecords;
        });
      } finally {
        setRemovingThreadId(null);
      }
    },
    loading,
    records,
    removingThreadId,
    selectedThreadId,
    selectThreadId,
    upsertRecord: (record: NativeAssistantThreadIndexRecord) =>
      setRecords((current) => upsertRecord(current, record))
  };
}

function selectThreadIdFromRecords(
  current: string | null,
  records: NativeAssistantThreadIndexRecord[]
): string | null {
  if (current && records.some((record) => record.providerThreadId === current)) return current;
  return null;
}
