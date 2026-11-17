import { useRef, useState } from 'react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import { linkAssistantThreadMaterial, unlinkAssistantThreadMaterial } from '../../shared/platform/assistantRuntime';

export function useAssistantMaterialLinks(onSaved: (record: NativeAssistantThreadIndexRecord) => void) {
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const savingRef = useRef(false);

  async function update(nodeId: string, record: NativeAssistantThreadIndexRecord | null, remove: boolean) {
    if (savingRef.current) return;
    setFailed(false);
    if (!record) {
      setDraftIds(ids => remove ? ids.filter(id => id !== nodeId) : [...new Set([...ids, nodeId])]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const updateLink = remove ? unlinkAssistantThreadMaterial : linkAssistantThreadMaterial;
      const saved = await updateLink({
        nodeId, provider: record.provider, providerThreadId: record.providerThreadId
      });
      if (!saved) throw new Error('assistant_material_link_unavailable');
      onSaved(saved);
    } catch {
      setFailed(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return {
    add: (nodeId: string, record: NativeAssistantThreadIndexRecord | null) => update(nodeId, record, false),
    remove: (nodeId: string, record: NativeAssistantThreadIndexRecord | null) => update(nodeId, record, true),
    draftIds,
    failed,
    saving,
    reset: () => { setDraftIds([]); setFailed(false); }
  };
}
