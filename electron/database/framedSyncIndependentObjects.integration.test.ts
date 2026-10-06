// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { recordLocalParentOrderVersion } from '../../lib/core/database/parentOrderVersionMutations.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { publishLocalNodePositionWithDriver } from '../../lib/core/sync/nodeVersionMemberPositionPublish.js';
import { prepareInboundApply } from '../sync/desktopFramedSyncPreparedInbound.js';

import { selectDesktopFramedSyncNodeManifest } from './desktopFramedSyncOutboundSelection.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('discovers an independent production order edit without a Node edit', async () => {
  const source = createPeer('order-source');
  edit(source, 'unchanged Node body');
  const before = (await readFramedSyncInventory(source.port)).filter((entry) => entry.objectType === 'node');
  const versionId = source.driver.transaction((driver) => recordLocalParentOrderVersion(driver, {
    before: [], createdAt: '2026-10-06T00:00:00.000Z', kind: 'user', order: ['topic'], parentId: 'root'
  }));
  const after = await readFramedSyncInventory(source.port);
  expect(after.filter((entry) => entry.objectType === 'node')).toEqual(before);
  expect(after).toContainEqual(expect.objectContaining({ globalId: versionId, objectType: 'order_version' }));
});

it('discovers the original production member position declaration', async () => {
  const source = createPeer('position-source');
  const receiver = createPeer('position-receiver');
  joinPeers(source, receiver);
  edit(source, 'Node with an adopted version');
  source.driver.transaction((driver) => publishLocalNodePositionWithDriver(driver, 'topic'));
  const facts = source.db.prepare("SELECT fact_id FROM node_version_member_positions WHERE object_id = 'topic'").all();
  expect(facts).toHaveLength(1);
  const inventory = await readFramedSyncInventory(source.port);
  expect(inventory.filter((entry) => entry.objectType === 'node_position').map((entry) => entry.globalId))
    .toEqual(facts.map((fact) => (fact as { fact_id: string }).fact_id));
});


it('selects and decodes immutable order facts through the production framed path', async () => {
  const source = createPeer('order-transfer');
  const receiver = createPeer('order-target');
  source.driver.transaction((driver) => recordLocalParentOrderVersion(driver, {
    before: [], createdAt: '2026-10-06T00:00:00.000Z', kind: 'user', order: [], parentId: 'root'
  }));
  const local = await readFramedSyncInventory(source.port);
  const differences = compareFramedSyncInventories({ local, remote: await readFramedSyncInventory(receiver.port) });
  const difference = differences.find((item) => item.objectType === 'order_version');
  expect(difference).toBeDefined();
  const manifest = await selectDesktopFramedSyncNodeManifest(source.port, difference!);
  const decoded = prepareInboundApply(manifest.facts, []);
  expect(decoded.stateRecords).toContainEqual(expect.objectContaining({
    object_type: 'order_version', object_id: difference!.globalId
  }));
});
