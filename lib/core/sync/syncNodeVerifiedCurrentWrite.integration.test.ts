// @vitest-environment node
import { expect, it } from 'vitest';

import { observeReads, referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { projectNodeInlineContent } from '../database/nodeInlineProjection.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { streamBodyFrontmatter } from './bodyFrontmatterText.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { writeVerifiedCurrentNode } from './syncNodeVerifiedCurrentWrite.js';
import { loadCurrentVerifiedSyncNode } from './syncNodeVerifiedGraph.js';
import { readBodyText } from './verifiedBody.js';

const timestamp = '2026-10-07T00:00:00.000Z';
const readNode = (host: ReturnType<typeof textDevice>) => host.sqlite.prepare("SELECT * FROM nodes WHERE id = 'topic'").get() as Record<string, unknown>;

it.each(['', '\ufeff---\r\nkey: ' + 'x'.repeat(3 * 1024 * 1024) + '\r\n---\r\nBody'])(
  'writes the selected current version and queues indexing without reading its text', async (body) => {
    const old = textDevice();
    const stable = textDevice();
    try {
      await migrateBodyContentStorage(stable.db);
      const original = textBranch('version', body, undefined, timestamp);
      await applySyncNodesWithDbPort(old.db, [original]);
      const record = await referencedNode(stable.db, original);
      const reads = observeReads(stable.db);
      expect(await writeVerifiedCurrentNode(reads.port, record, { invalidatedAt: timestamp }))
        .toEqual({ repaired: [], unmapped: [] });
      const expected = readNode(old);
      expect(readNode(stable)).toEqual({ ...expected, content: '' });
      expect(stable.sqlite.prepare('SELECT * FROM sync_object_state').all())
        .toEqual(old.sqlite.prepare('SELECT * FROM sync_object_state').all());
      expect(reads.sizes).toEqual([]);
      const restored = await loadCurrentVerifiedSyncNode(reads.port, 'topic');
      if (restored?.body.kind !== 'readable') throw new Error('readable_current_required');
      expect(await readBodyText(stable.db, restored.body.ref)).toBe(body);
      let prefix = '';
      for await (const part of streamBodyFrontmatter(stable.db, restored.body.ref)) prefix += part;
      expect(prefix).toBe(projectNodeInlineContent(body));
      expect(stable.sqlite.prepare('SELECT invalidation_type, target_id, status FROM search_index_invalidations').all())
        .toEqual([{ invalidation_type: 'node_workspace', target_id: 'topic', status: 'pending' }]);
      expect(stable.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
    } finally { old.sqlite.close(); stable.sqlite.close(); }
  }
);

it('updates current metadata and repairs child anchors using the same decisions as ordinary string application', async () => {
  const old = textDevice();
  const stable = textDevice();
  try {
    const base = textBranch('base', 'unique', undefined, timestamp);
    await applySyncNodesWithDbPort(old.db, [base]);
    await applySyncNodesWithDbPort(stable.db, [base]);
    const anchor = JSON.stringify({ id: 'anchor', kind: 'highlight', locator: { from: 0, to: 6, originalText: 'unique' } });
    for (const host of [old, stable]) host.sqlite.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
      VALUES ('child', 'topic', 'item', 'Child', '', ?, ?, ?)`).run(anchor, timestamp, timestamp);
    await migrateBodyContentStorage(stable.db);
    const original = textBranch('next', 'Lead 中文😀 unique', base, '2026-10-07T01:00:00.000Z');
    original.snapshot.title = 'Renamed';
    const expected = await applySyncNodesWithDbPort(old.db, [original]);
    const record = await referencedNode(stable.db, original);
    const observed = observeReads(stable.db);
    const actual = await writeVerifiedCurrentNode(observed.port, record, { invalidatedAt: timestamp });
    expect(actual).toEqual({ repaired: expected.anchorRepairRecords, unmapped: expected.unmappedAnchorRecords });
    expect(readNode(stable)).toEqual(readNode(old));
    const oldChild = old.sqlite.prepare("SELECT * FROM nodes WHERE id = 'child'").get() as Record<string, unknown>;
    expect(stable.sqlite.prepare("SELECT * FROM nodes WHERE id = 'child'").get())
      .toEqual({ ...oldChild, body_blob_hash: hashTextBody('') });
    expect(stable.sqlite.prepare('SELECT * FROM sync_object_state').all())
      .toEqual(old.sqlite.prepare('SELECT * FROM sync_object_state').all());
    expect(observed.sizes.length).toBeGreaterThan(0);
    expect(Math.max(...observed.sizes)).toBeLessThanOrEqual(512 * 1024);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('rolls back current ownership, version and search state together when queue persistence fails', async () => {
  const host = textDevice();
  try {
    await migrateBodyContentStorage(host.db);
    const record = await referencedNode(host.db, textBranch('version', 'Original', undefined, timestamp));
    host.sqlite.exec(`CREATE TRIGGER fail_search_enqueue BEFORE INSERT ON search_index_invalidations
      BEGIN SELECT RAISE(ABORT, 'queue_unavailable'); END`);
    await expect(writeVerifiedCurrentNode(host.db, record, { invalidatedAt: timestamp })).rejects.toThrow('queue_unavailable');
    for (const table of ['nodes', 'node_sync_versions', 'content_blobs', 'sync_object_state', 'search_index_invalidations']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(host.sqlite.prepare('SELECT count(*) FROM content_bodies WHERE verified = 1').pluck().get()).toBe(1);
    host.sqlite.exec('DROP TRIGGER fail_search_enqueue');
    await writeVerifiedCurrentNode(host.db, record, { invalidatedAt: timestamp });
    expect(readNode(host).current_version_id).toBe('version');
  } finally { host.sqlite.close(); }
});
