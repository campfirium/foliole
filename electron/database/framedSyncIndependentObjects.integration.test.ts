// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { saveLocalCurrentParentOrder } from '../../lib/core/database/currentParentOrderStore.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('discovers an independent production order edit without a Node edit', async () => {
  const source = createPeer('order-source');
  edit(source, 'unchanged Node body');
  const before = (await readFramedSyncInventory(source.port)).filter((entry) => entry.objectType === 'node');
  saveLocalCurrentParentOrder(source.driver, { parentId: 'root', childIds: ['topic'],
    now: '2026-10-06T00:00:00.000Z', hostName: source.name });
  const after = await readFramedSyncInventory(source.port);
  expect(after.filter((entry) => entry.objectType === 'node')).toEqual(before);
  expect(after).toContainEqual(expect.objectContaining({ globalId: 'root', objectType: 'parent_child_order' }));
});

it('does not publish replication positions after a local edit', async () => {
  const source = createPeer('position-source');
  const receiver = createPeer('position-receiver');
  joinPeers(source, receiver);
  edit(source, 'Node with an adopted version');
  const inventory = await readFramedSyncInventory(source.port);
  expect(inventory.some(entry => entry.objectType === 'node_position')).toBe(false);
  expect(source.db.prepare("SELECT name FROM sqlite_master WHERE name = 'node_version_member_positions'").all()).toEqual([]);
  expect(source.db.prepare('SELECT proof_revision FROM node_version_local_proof_state').pluck().get()).toBeGreaterThan(0);
});
