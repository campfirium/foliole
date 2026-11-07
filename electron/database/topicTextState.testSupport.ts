import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';
import { readTopicAlternativeRecords, topicAlternativeEntry } from '../../lib/core/sync/topicAlternativeStore.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export function textDevice() {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  const db = createBetterSqliteDbPort(sqlite);
  return {
    sqlite, db,
    async receive(records: NativeSyncNodeRecord[]) {
      await applyConvergentSyncNodesWithDbPort(db, records);
      return (await loadCurrentSyncNodeRecord(db, 'topic'))!;
    },
    async current() { return (await loadCurrentSyncNodeRecord(db, 'topic'))!; },
    async alternatives() { return (await readTopicAlternativeRecords(db, 'topic')).map(topicAlternativeEntry); },
    imageReferences() {
      const rows = sqlite.prepare(`SELECT resource_references FROM nodes WHERE id='topic'
        UNION ALL SELECT resource_references FROM node_text_alternatives WHERE node_id='topic' AND status='available'`)
        .all() as { resource_references: string }[];
      return rows.flatMap(row => JSON.parse(row.resource_references));
    },
    async wholeBodies() {
      const current = await loadCurrentSyncNodeRecord(db, 'topic');
      return new Set([current?.body_text, ...(await readTopicAlternativeRecords(db, 'topic')).map(row => row.body_text)]);
    }
  };
}

export function textBranch(id: string, body: string, parent?: NativeSyncNodeRecord,
  timestamp = new Date().toISOString()): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: parent ? [parent.version_id!, ...parent.ancestor_version_ids] : [],
    body_text: body, content_hash: hashText(`${id}\n${body}`), host_name: id,
    object_id: 'topic', object_type: 'node', parent_version_id: parent?.version_id ?? null,
    parent_version_ids: parent ? [parent.version_id!] : [], updated_at: timestamp,
    version_created_at: timestamp, version_id: id,
    snapshot: {
      anchor_link: null, attachments: [], content: body, created_at: parent?.snapshot.created_at ?? timestamp,
      deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'topic',
      image_regions: null, is_title_manual: false, kind: 'topic', opening_text: null,
      parent_id: null, position: null, priority: null, reveal: null, title: 'Topic',
      updated_at: timestamp, virtual_filter: null,
      text_alternatives: parent?.snapshot.text_alternatives ?? [],
      text_selection: { version_id: id, created_at: timestamp }
    },
    ...(parent?.alternative_bodies ? { alternative_bodies: parent.alternative_bodies } : {})
  };
}

export function wholeBodies(record: NativeSyncNodeRecord) {
  return new Set([record.body_text, ...record.alternative_bodies?.map((entry) => entry.text) ?? []]);
}

/** Observe both durable owners; a main version deliberately carries no alternative payload. */
export async function readPersistedTopicBodies(db: DbPort, nodeId = 'topic') {
  const current = await loadCurrentSyncNodeRecord(db, nodeId);
  if (!current) throw new Error(`fixture_current_topic_missing:${nodeId}`);
  return new Set([current.body_text, ...(await readTopicAlternativeRecords(db, nodeId)).map(row => row.body_text)]);
}
