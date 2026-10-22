// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';

import { recordResourceAvailabilityInBulk } from './legacyResourceAvailability.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, type Peer, startLibraries } from './syncLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

const hash = (digit: string) => digit.repeat(64);

function addNode(peer: Peer, nodeId: string, hashes: string[]) {
  peer.driver.transaction((driver) => {
    upsertNodeSnapshot(driver, { anchorLink: null, content: `${nodeId} body`, createdAt: '2026-10-01T00:00:00.000Z',
      hostName: peer.name, isTitleManual: true, kind: 'topic', nodeId, parentNodeId: null,
      position: null, reveal: null, title: nodeId, updatedAt: '2026-10-01T00:00:00.000Z' });
    driver.execute('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?', [JSON.stringify(hashes.map((value) =>
      ({ original_name: `${value.slice(0, 4)}.png`, role: 'image', storage_key: `${value}.png` }))), nodeId]);
    flushNodeSyncVersionWithDriver(driver, nodeId, peer.name, '2026-10-01T00:00:01.000Z');
  });
}

function library(name: string) {
  const peer = createPeer(name);
  addNode(peer, 'first', [hash('a'), hash('b')]);
  addNode(peer, 'second', [hash('b')]);
  addNode(peer, 'missing', [hash('c')]);
  addNode(peer, 'plain', []);
  peer.db.prepare(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL).run(hash('b'), 0);
  return peer;
}

function resources(peer: Peer) {
  const rows = peer.db.prepare(`SELECT object_id, resources_json FROM framed_sync_inventory
    WHERE object_type = 'node' AND object_id != 'special-virtual-root' ORDER BY object_id`).all();
  return { availability: peer.db.prepare('SELECT * FROM framed_sync_resource_availability ORDER BY hash').all(), rows };
}

it('produces the same inventory as one triggered availability write per file hash', () => {
  const triggered = library('triggered');
  const bulk = library('bulk');
  const files = [hash('a'), hash('b'), hash('d')];
  triggered.db.transaction(() => {
    for (const value of files) triggered.db.prepare(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL).run(value, 1);
  })();
  bulk.db.transaction(() => recordResourceAvailabilityInBulk(bulk.db, files))();
  const expected = resources(triggered);
  expect(expected.rows).toContainEqual({ object_id: 'first', resources_json: expect.stringContaining(hash('b')) });
  expect(resources(bulk)).toEqual(expected);
});

it('keeps later availability writes refreshing the inventory', () => {
  const peer = library('later');
  peer.db.transaction(() => recordResourceAvailabilityInBulk(peer.db, [hash('a')]))();
  const read = () => String((peer.db.prepare(`SELECT resources_json FROM framed_sync_inventory
    WHERE object_type = 'node' AND object_id = 'missing'`).get() as { resources_json: string }).resources_json);
  expect(JSON.parse(read())).not.toContain(hash('c'));
  peer.db.prepare(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL).run(hash('c'), 1);
  expect(JSON.parse(read())).toContain(hash('c'));
});
