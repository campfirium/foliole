// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess }
  from './desktopFramedSyncTwoProcess.testSupport.js';
import { readDesktopFramedSyncLibraryEvidence } from './desktopFramedSyncTwoProcessEvidence.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];
afterEach(async ({ task }) => {
  const active = processes.splice(0);
  await Promise.allSettled(active.map(process => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    await fs.writeFile(path.join(root, 'processes.log'), active.map(process => process.diagnostics()).join('\n'));
    console.info('File round evidence:', root);
  } else await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function assertNoTransportRows(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    for (const table of ['framed_sync_outbound_publications', 'framed_sync_outbound_attempts',
      'framed_sync_outbound_frames', 'framed_sync_outbound_holds', 'framed_sync_inbound_transfers',
      'framed_sync_inbound_frames', 'framed_sync_inbound_facts', 'framed_sync_receipts',
      'framed_sync_session_send_states', 'framed_sync_blob_pins', 'framed_sync_available_blobs',
      'framed_sync_resource_demands', 'framed_sync_completion_windows', 'framed_sync_resource_pins']) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table).toBeUndefined();
    }
  } finally { db.close(); }
}

it('converges independent processes through inventory, HTTP, resource transfer and reopening without transport rows', { meta: { calibratedMs: 120_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  expect(fixture.leftSnapshot.pid).not.toBe(fixture.rightSnapshot.pid);
  await fixture.left.seed({ content: 'Frozen business body\n' + 'a'.repeat(1_000_000), nodeId: 't326-file-round', title: 'File round' });
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), Buffer.alloc(90_000, 0x61)]);
  const resource = await fixture.left.seedResource({ bytes, includeImageInBody: true, nodeId: 't326-file-resource' });
  expect(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
  const left = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const right = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(right.nodes).toEqual(left.nodes);
  expect(right.versions).toEqual(left.versions);
  const asset = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', resource.storageKey);
  expect(await fs.readFile(asset)).toEqual(bytes);
  assertNoTransportRows(fixture.leftSnapshot.databasePath);
  assertNoTransportRows(fixture.rightSnapshot.databasePath);
  const reopened = await fixture.restartRight();
  processes.push(reopened.process);
  expect(await reconnectFixturePeer(reopened.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(readDesktopFramedSyncLibraryEvidence(reopened.snapshot.databasePath).versions).toEqual(right.versions);
  assertNoTransportRows(reopened.snapshot.databasePath);
});

it('delivers the same requested content again after file retirement and process restart', { meta: { calibratedMs: 120_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  await fixture.left.seed({ content: 'Body requested again after acknowledgement',
    nodeId: 't326-repeat-file-delivery', title: 'Repeated delivery' });
  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-repeat-file-delivery');
  const before = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(before.nodes).toEqual([expect.objectContaining({ content: 'Body requested again after acknowledgement' })]);
  const restarted = await fixture.restartLeft();
  processes.push(restarted.process);
  await restarted.process.synchronize(fixture.rightSnapshot.origin, 't326-repeat-file-delivery');
  const after = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.versions).toEqual(before.versions);
  assertNoTransportRows(restarted.snapshot.databasePath);
  assertNoTransportRows(fixture.rightSnapshot.databasePath);
});

it('versions remapped child anchors and converges both durable libraries after a remote parent edit', { meta: { calibratedMs: 120_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  await fixture.left.seed({ content: 'Alpha Beta Gamma', nodeId: 'anchor-parent', title: 'Parent' });
  await fixture.left.seed({ content: 'Child body', nodeId: 'anchor-child', title: 'Child',
    parentNodeId: 'anchor-parent', anchorLink: { id: 'anchor', kind: 'highlight',
      locator: { from: 6, to: 10, originalText: 'Beta' } } });
  expect(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
  await fixture.left.seed({ content: 'Prefix Alpha Beta Gamma', nodeId: 'anchor-parent', title: 'Parent' });
  expect(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
  const read = (file: string) => {
    const db = new Database(file, { readonly: true });
    try {
      return { nodes: db.prepare(`SELECT id,parent_id,content,deleted_at,current_version_id,sync_dirty,anchor_link,
        anchor_resolution_status,anchor_source_version_id FROM nodes
        WHERE id IN ('anchor-child','anchor-parent') ORDER BY id`).all(),
      versions: db.prepare(`SELECT version_id,parent_version_id,content_hash,body_text,
        json_extract(snapshot_json,'$.parent_id') AS parent_id,
        json_extract(snapshot_json,'$.deleted_at') AS deleted_at,
        json_extract(snapshot_json,'$.anchor_link') AS anchor_link,
        json_extract(snapshot_json,'$.anchor_resolution_status') AS anchor_resolution_status,
        json_extract(snapshot_json,'$.anchor_source_version_id') AS anchor_source_version_id
        FROM node_sync_versions WHERE object_id IN ('anchor-child','anchor-parent') ORDER BY version_id`).all() };
    } finally { db.close(); }
  };
  const settled = read(fixture.rightSnapshot.databasePath);
  expect(settled).toEqual(read(fixture.leftSnapshot.databasePath));
  expect(settled.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'anchor-child',
    sync_dirty: 0, anchor_resolution_status: 'resolved', anchor_source_version_id: expect.any(String),
    anchor_link: expect.stringContaining('"from":13') })]));
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  expect(await reconnectFixturePeer(restarted.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(read(restarted.snapshot.databasePath)).toEqual(settled);
  expect(read(fixture.leftSnapshot.databasePath)).toEqual(settled);
});
