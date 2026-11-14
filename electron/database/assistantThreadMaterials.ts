import type { NativeAssistantProviderId } from '../../lib/platform/nativeAssistantContract.js';

import { openAssistantHistoryConnection } from './assistantHistoryConnection.js';
import { readAssistantThreadIndexRecord } from './assistantThreadIndex.js';

export function linkAssistantThreadMaterials(provider: NativeAssistantProviderId, threadId: string, nodeIds: string[]) {
  const { driver } = openAssistantHistoryConnection();
  return driver.transaction(() => {
    const record = readAssistantThreadIndexRecord(provider, threadId);
    if (record.status === 'deleted') throw new Error('assistant_thread_deleted');
    const openingId = record.location.type === 'node' ? record.location.nodeId : null;
    const linkedMaterialIds = [...new Set([...(record.linkedMaterialIds ?? []), ...nodeIds])]
      .filter(id => id !== openingId);
    driver.execute(
      'UPDATE assistant_thread_index SET linked_material_ids = ? WHERE provider = ? AND provider_thread_id = ?',
      [JSON.stringify(linkedMaterialIds), provider, threadId]
    );
    return { ...record, linkedMaterialIds };
  });
}
