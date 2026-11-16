import { createHash } from 'node:crypto';

import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';

export function superMemoBatchKey(elements: SuperMemoXmlDraftElement[]) {
  const batchId = createHash('sha256').update(JSON.stringify(elements)).digest('hex');
  return { batchId, key: `supermemo-import:${batchId}` };
}
