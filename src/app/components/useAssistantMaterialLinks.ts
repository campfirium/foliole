import { useState } from 'react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import { linkAssistantThreadMaterial } from '../../shared/platform/assistantRuntime';

export function useAssistantMaterialLinks(onSaved: (record: NativeAssistantThreadIndexRecord) => void) {
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function add(nodeId: string, record: NativeAssistantThreadIndexRecord | null) {
    setFailed(false);
    if (!record) {
      setDraftIds(ids => [...new Set([...ids, nodeId])]);
      return;
    }
    setSaving(true);
    try {
      const saved = await linkAssistantThreadMaterial({
        nodeId, provider: record.provider, providerThreadId: record.providerThreadId
      });
      if (!saved) throw new Error('assistant_material_link_unavailable');
      onSaved(saved);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return { add, draftIds, failed, saving, reset: () => { setDraftIds([]); setFailed(false); } };
}
