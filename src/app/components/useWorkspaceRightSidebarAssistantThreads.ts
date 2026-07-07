import { useEffect, useState } from 'react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import { listAssistantThreadIndex } from '../../shared/platform/assistantRuntime';

import { resolveAssistantLocation, upsertRecord } from './workspaceRightSidebarAssistantPanelModel';

export function useWorkspaceRightSidebarAssistantThreads(
  location: ReturnType<typeof resolveAssistantLocation>,
  enabled: boolean
) {
  const [records, setRecords] = useState<NativeAssistantThreadIndexRecord[]>([]);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    loading,
    records,
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
  return records[0]?.providerThreadId ?? null;
}
