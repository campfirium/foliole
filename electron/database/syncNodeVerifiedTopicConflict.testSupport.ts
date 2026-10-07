import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { stageTextBodyContent } from '../../lib/core/sync/bodyContentWrite.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { FramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import type { VerifiedFramedSyncNode } from '../../lib/core/sync/framedSyncVerifiedNode.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

export const FORMED_AT = '2026-10-07T12:00:00.000Z';
export const BASE_AT = '2026-10-07T00:00:00.000Z';

export function nodeMetadata(record: NativeSyncNodeRecord): FramedSyncNodeMetadata {
  const metadata = { ...record };
  delete metadata.body_text;
  delete metadata.alternative_bodies;
  const snapshotMetadata = { ...record.snapshot };
  delete snapshotMetadata.content;
  return { ...metadata, snapshot: snapshotMetadata };
}

export async function referencedNode(db: DbPort, record: NativeSyncNodeRecord): Promise<VerifiedFramedSyncNode> {
  const ref = await db.transaction((tx) => stageTextBodyContent(tx, record.body_text!));
  const alternatives = [];
  for (const body of record.alternative_bodies ?? []) {
    alternatives.push(await db.transaction((tx) => stageTextBodyContent(tx, body.text)));
  }
  return { metadata: nodeMetadata(record), body: { kind: 'readable', ref }, alternativeBodies: alternatives };
}

export function branches(localBody: string, incomingBody: string) {
  const base = textBranch('base', 'Original', undefined, BASE_AT);
  const local = textBranch('local', localBody, base, '2026-10-07T01:00:00.000Z');
  const incoming = textBranch('incoming', incomingBody, base, '2026-10-07T02:00:00.000Z');
  return { base, local, incoming };
}

export async function seededDevice(base: NativeSyncNodeRecord, local: NativeSyncNodeRecord,
  incoming: readonly NativeSyncNodeRecord[], stable: boolean, anchorVersion?: string) {
  const device = textDevice();
  try {
    const current = await device.receive([base, local]);
    for (const record of incoming) await upsertRemoteVersion(device.db, record);
    if (anchorVersion) device.sqlite.prepare(`INSERT INTO nodes
      (id, parent_id, kind, content, title, anchor_source_version_id, created_at, updated_at)
      VALUES ('child', 'topic', 'item', '', 'Child', ?, ?, ?)`).run(anchorVersion, BASE_AT, BASE_AT);
    if (stable) await migrateBodyContentStorage(device.db);
    return { ...device, current };
  } catch (error) { device.sqlite.close(); throw error; }
}

/** Observe the real database boundary; no body storage or graph query is mocked. */
export function observeReads(db: DbPort) {
  const sizes: number[] = [];
  const observe = (source: DbPort): DbPort => ({ ...source,
    query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      const rows = await source.query<T>(sql, params);
      for (const row of rows) {
        if (row.data instanceof Uint8Array) sizes.push(row.data.byteLength);
        if (typeof row.body_text === 'string') throw new Error('unexpected_full_body_read');
      }
      return rows;
    },
    transaction: (run) => source.transaction((tx) => run(observe(tx)))
  });
  return { port: observe(db), sizes };
}
