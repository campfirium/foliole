// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../database/syncLibrary.testSupport.js';
import { syncRequestLibrary } from '../database/syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function peers() {
  const source = createPeer('source'); const target = createPeer('target');
  joinPeers(source, target);
  seed(source);
  return { source, target };
}

it('applies all canonical fields to a new node through current requests', async () => {
  const { source, target } = peers();
  flushNodeSyncVersionWithDriver(source.driver, 'node-1', source.name, '2026-07-10T01:00:00.000Z');
  await syncRequestLibrary(source, target);
  expect(readCanonicalFields(target)).toEqual({
    anchor_link: '{"id":"anchor-new"}', desired_retention: 0.91, enable_short_term: 0,
    image_regions: '[{"source":"pack"}]', import_content_fingerprint: 'content-pack',
    import_source_fingerprint: 'source-pack', manual_child_order: '["child-b","child-a"]',
    priority: 4, sequential_reading_enabled: 1, virtual_filter: '{"kind":"manual"}'
  });
  await assertReopenedReplay(source, target);
});

it('treats explicit nulls as authoritative for an existing node through current requests', async () => {
  const { source, target } = peers();
  flushNodeSyncVersionWithDriver(source.driver, 'node-1', source.name, '2026-07-10T01:00:00.000Z');
  await syncRequestLibrary(source, target);
  source.db.exec(`UPDATE nodes SET priority = NULL, desired_retention = NULL, enable_short_term = NULL,
    sequential_reading_enabled = NULL, manual_child_order = NULL, virtual_filter = NULL,
    anchor_link = NULL, image_regions = NULL, import_source_fingerprint = NULL,
    import_content_fingerprint = 'partial-content', sync_dirty = 1,
    updated_at = '2026-07-11T01:00:00.000Z' WHERE id = 'node-1'`);
  flushNodeSyncVersionWithDriver(source.driver, 'node-1', source.name, '2026-07-11T01:00:00.000Z');
  await syncRequestLibrary(source, target);
  expect(readCanonicalFields(target)).toEqual({
    anchor_link: null, desired_retention: null, enable_short_term: null, image_regions: null,
    import_content_fingerprint: null, import_source_fingerprint: null, manual_child_order: null,
    priority: null, sequential_reading_enabled: null, virtual_filter: null
  });
  await assertReopenedReplay(source, target);
});

it('preserves article image sources through current request apply and reopening', async () => {
  const { source, target } = peers();
  const sources = JSON.stringify({ [`${'a'.repeat(64)}.png`]: 'https://example.com/original.png' });
  source.db.prepare('UPDATE nodes SET image_sources = ? WHERE id = ?').run(sources, 'node-1');
  flushNodeSyncVersionWithDriver(source.driver, 'node-1', source.name, '2026-07-10T01:00:00.000Z');
  await syncRequestLibrary(source, target);
  await assertReopenedReplay(source, target);
  const reopened = new Database(target.file, { readonly: true });
  try { expect(reopened.prepare('SELECT image_sources FROM nodes WHERE id = ?').pluck().get('node-1')).toBe(sources); }
  finally { reopened.close(); }
});

function readCanonicalFields(peer: Pick<Peer, 'db'>) {
  return peer.db.prepare(`SELECT priority, desired_retention, enable_short_term, sequential_reading_enabled,
    manual_child_order, virtual_filter, anchor_link, image_regions,
    import_source_fingerprint, import_content_fingerprint FROM nodes WHERE id = 'node-1'`).get();
}

async function assertReopenedReplay(source: Peer, target: Peer) {
  const before = target.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  await syncRequestLibrary(source, target);
  const reopened = new Database(target.file, { readonly: true });
  try {
    expect(readCanonicalFields({ db: reopened })).toEqual(readCanonicalFields(target));
    expect(reopened.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  } finally { reopened.close(); }
}

function seed(peer: Peer) {
  peer.db.prepare(
      `INSERT INTO nodes (
         id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled,
         manual_child_order, title, is_title_manual, hide_title_heading, content,
         virtual_filter, anchor_link, image_regions, import_source_fingerprint,
         import_content_fingerprint, created_at, updated_at
       ) VALUES ('node-1', 'folder', 4, 0.91, 0, 1, '["child-b","child-a"]',
         'Packed folder', 1, 0, '', '{"kind":"manual"}', '{"id":"anchor-new"}',
         '[{"source":"pack"}]', 'source-pack', 'content-pack',
         '2026-07-10T00:00:00.000Z', '2026-07-10T01:00:00.000Z')`
    ).run();
}
