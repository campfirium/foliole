import { parseImageSources } from '../database/imageSources.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';

import type { DbPort } from './dbPort.js';
import { applyLocalContentEdit } from './localContentEdit.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { TOPIC_ALTERNATIVE_METADATA_COLUMNS, validateTopicAlternativeRecord, type TopicAlternativeMetadata, type TopicAlternativeRecord } from './topicAlternativeRecord.js';
import { retireTopicAlternative } from './topicAlternativeStore.js';

export async function mutateTopicText(db: DbPort, input: {
  nodeId: string; alternativeId: string; action: 'promoted' | 'dismissed';
  now: string; versionId: string; hostName: string;
}) {
  return db.transaction(async tx => {
    const [node] = await tx.query('SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [input.nodeId]);
    if (!node) return unavailable(input);
    const columns = input.action === 'promoted' ? '*' : TOPIC_ALTERNATIVE_METADATA_COLUMNS;
    const [row] = await tx.query<TopicAlternativeMetadata>(`SELECT ${columns} FROM node_text_alternatives
      WHERE node_id = ? AND alternative_id = ? AND status = 'available' AND expires_at > ?`,
    [input.nodeId, input.alternativeId, input.now]);
    if (!row) return unavailable(input);
    if (input.action === 'promoted') {
      const selected = validateTopicAlternativeRecord(row as TopicAlternativeRecord);
      const current = await loadCurrentSyncNodeRecord(tx, input.nodeId);
      if (!current?.version_id) return unavailable(input);
      const sources = parseImageSources(selected.image_sources);
      const references = parseNodeResourceReferences(selected.resource_references)
        .filter(reference => reference.role === 'image')
        .map(reference => ({ ...reference, ...(sources[reference.storage_key] ? { source_url: sources[reference.storage_key] } : {}) }));
      await applyLocalContentEdit(tx, { nodeId: input.nodeId, baseVersionId: current.version_id,
        baseContent: current.body_text ?? '', versionId: input.versionId, content: selected.body_text,
        newImageReferences: references, title: current.snapshot.title,
        hideTitleHeading: current.snapshot.hide_title_heading, hostName: input.hostName, updatedAt: input.now });
    }
    await retireTopicAlternative(tx, row, input.action, input.now);
    await collectNodeVersionPayloads(tx, input.nodeId, Number.MAX_SAFE_INTEGER);
    return { alternative_id: row.alternative_id, node_id: input.nodeId, status: input.action };
  });
}

function unavailable(input: { alternativeId: string }) {
  return { alternative_id: input.alternativeId, node_id: null, status: 'unavailable' as const };
}
