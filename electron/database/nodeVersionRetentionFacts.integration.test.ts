// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { closeLibraries, createPeer, edit, history, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('leaves a missing parent edge unproven without changing its immutable metadata', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'Base');
  const middle = edit(source, 'Middle');
  edit(source, 'Head');
  await sync(source, target);
  await sync(target, source);
  const original = history(target).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id }));
  target.db.prepare('DELETE FROM node_sync_version_parents WHERE version_id = ?').run(middle);
  collectNodeVersionChainWithDriver(target.driver, 'topic');
  expect((await collectNodeVersionPayloads(target.port, 'topic')).skipped).toBe('lineage_unproven');
  expect(history(target).map(({ version_id, parent_version_id }) => ({ version_id, parent_version_id })))
    .toEqual(original);
  expect(history(target).find((row) => row.version_id === middle)?.parent_version_id).toBe(base);
  expect(target.db.prepare('SELECT COUNT(*) FROM node_sync_version_parents WHERE version_id = ?')
    .pluck().get(middle)).toBe(0);

});
