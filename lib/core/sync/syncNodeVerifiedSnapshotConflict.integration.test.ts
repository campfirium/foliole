// @vitest-environment node
import { expect, it } from 'vitest';

import { nodeMetadata, observeReads, referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';

import { resolveFolderConflict } from './syncFolderResolution.js';
import { resolveItemConflict } from './syncItemResolution.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { resolveVerifiedSnapshotConflict } from './syncNodeVerifiedSnapshotConflict.js';
import { readBodyText } from './verifiedBody.js';

const timestamp = '2026-10-07T00:00:00.000Z';
const cases = [
  ['Original', 'Changed locally', 'Original'],
  ['Original', 'Original', 'Changed remotely'],
  ['Original', 'Left branch', 'Right branch'],
  ['', '', ''],
  ['Original', '中文🙂'.repeat(300000), 'Original']
] as const;

it.each(['folder', 'item'] as const)('keeps %s body selection, metadata merge and resolution identity with stable references', async (kind) => {
  for (const [baseBody, leftBody, rightBody] of cases) {
    const old = textDevice();
    const stable = textDevice();
    try {
      const base = textBranch('base', baseBody, undefined, timestamp);
      base.snapshot.kind = kind;
      base.snapshot.manual_child_order = '["a","b"]';
      const local = textBranch('left', leftBody, base, '2026-10-07T01:00:00.000Z');
      local.snapshot = { ...base.snapshot, content: leftBody, title: 'Local rename', manual_child_order: '["a","c"]' };
      const incoming = textBranch('right', rightBody, base, '2026-10-07T02:00:00.000Z');
      incoming.snapshot = { ...base.snapshot, content: rightBody, priority: 2, manual_child_order: '["a","b","d"]' };
      for (const host of [old, stable]) {
        await applySyncNodesWithDbPort(host.db, [local, base]);
        await upsertRemoteVersion(host.db, incoming);
      }
      await migrateBodyContentStorage(stable.db);
      const expected = await (kind === 'folder' ? resolveFolderConflict : resolveItemConflict)(old.db, [incoming]);
      const record = await referencedNode(stable.db, incoming);
      const reads = observeReads(stable.db);
      const actual = await resolveVerifiedSnapshotConflict(reads.port, [record], kind);
      expect(actual.metadata).toEqual(nodeMetadata(expected));
      if (actual.body.kind !== 'readable') throw new Error('readable_resolution_required');
      expect(await readBodyText(stable.db, actual.body.ref)).toBe(expected.body_text);
      expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
      expect(stable.sqlite.prepare('SELECT * FROM nodes').all()).toEqual(old.sqlite.prepare('SELECT * FROM nodes').all());
      for (const table of ['node_sync_version_parents', 'sync_object_state', 'node_version_local_origins']) {
        expect(stable.sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual(old.sqlite.prepare(`SELECT * FROM ${table}`).all());
      }
      const current = await loadCurrentVerifiedSyncNode(stable.db, 'topic');
      expect(current?.metadata.version_id).toBe(expected.version_id);
    } finally { old.sqlite.close(); stable.sqlite.close(); }
  }
});

it.each(['folder', 'item'] as const)('rejects a retired %s merge base before creating a resolution', async (kind) => {
  const host = textDevice();
  try {
    const base = textBranch('base', 'Original', undefined, timestamp);
    const local = textBranch('left', 'Left', base, timestamp);
    const incoming = textBranch('right', 'Right', base, timestamp);
    for (const record of [base, local, incoming]) record.snapshot.kind = kind;
    await applySyncNodesWithDbPort(host.db, [base, local]);
    await upsertRemoteVersion(host.db, incoming);
    await migrateBodyContentStorage(host.db);
    host.sqlite.prepare("UPDATE node_sync_versions SET body_state = 'retired', body_blob_hash = NULL WHERE version_id = 'base'").run();
    const record = await referencedNode(host.db, incoming);
    await expect(resolveVerifiedSnapshotConflict(host.db, [record], kind)).rejects.toThrow(`sync_${kind}_merge_base_body_unavailable:base`);
    expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE host_name = 'desktop-resolution'").pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
