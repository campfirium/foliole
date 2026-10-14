// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { readFixtureInventory } from '../../../../../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport.js';
import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

async function adopt() {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Source', providerPlatform: 'darwin' });
  await fixture.right.seed({ content: 'Original', nodeId: 't326-adoption-article', title: 'Original' });
  let pulled = false;
  native.post.mockImplementation(async input => {
    const kind = new URL(input.url).searchParams.get('request');
    if (pulled && kind === 'inventory') throw new Error('fixture_stop_before_completion');
    const response = await host!.post(input);
    if (kind === 'pulls') pulled = true;
    return response;
  });
  await expect(host.sync()).rejects.toThrow('fixture_stop_before_completion');
  expect(await loadSyncGroupLocalAdoption(host.db)).not.toBeNull();
  expect(await loadSyncGroupOverwriteProgress(host.db)).not.toBeNull();
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ content: 'Original' }));
  native.post.mockImplementation(host.post);
  await fixture.left.seed({ content: 'Saved local edit😀', nodeId: 't326-adoption-article', title: 'Edited' });
  return host;
}

it('finishes adoption and sends the saved local edit in the same companion round', async () => {
  const host = await adopt();
  const result = await host.sync();
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(await loadSyncGroupOverwriteProgress(host.db)).toBeNull();
  expect(result.remainingStructureChangeCount).toBe(0);
  expect(result.pushedNodeIds).toContain('t326-adoption-article');
  for (const snapshot of [host.fixture.leftSnapshot, host.fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ content: 'Saved local edit😀' })]);
  }
  expect(await readFixtureInventory(host.fixture.left)).toEqual(await readFixtureInventory(host.fixture.right));
}, 20000);

it('keeps adoption protected if the source changes after delivery', async () => {
  const host = await adopt();
  let changed = false;
  native.post.mockImplementation(async input => {
    const response = await host.post(input);
    if (!changed && new URL(input.url).searchParams.get('request') === 'pulls') {
      changed = true;
      await host.fixture.right.seed({ content: 'Source changed', nodeId: 't326-adoption-article', title: 'Source changed' });
    }
    return response;
  });
  const result = await host.sync();
  expect(changed).toBe(true);
  expect(await loadSyncGroupLocalAdoption(host.db)).not.toBeNull();
  expect(await loadSyncGroupOverwriteProgress(host.db)).not.toBeNull();
  expect(result.remainingStructureChangeCount).toBeGreaterThan(0);
  expect(result.pushedNodeIds).toEqual([]);
  expect(readDesktopFramedSyncLibraryEvidence(host.fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Saved local edit😀' })]);
  expect(readDesktopFramedSyncLibraryEvidence(host.fixture.rightSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Source changed' })]);
}, 20000);

it('preserves a local addition and converges ordering after adoption completes', async () => {
  const host = await adopt();
  await host.fixture.left.seed({ content: 'Local addition', nodeId: 't326-second-article', title: 'Local addition' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(await loadSyncGroupOverwriteProgress(host.db)).toBeNull();
  for (const snapshot of [host.fixture.leftSnapshot, host.fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual([
      expect.objectContaining({ id: 't326-adoption-article', content: 'Saved local edit😀' }),
      expect.objectContaining({ id: 't326-second-article', content: 'Local addition' })
    ]);
  }
  expect(await readFixtureInventory(host.fixture.left)).toEqual(await readFixtureInventory(host.fixture.right));
}, 20000);


it('retains a newer local open state while finishing adoption', async () => {
  const host = await adopt();
  async function opened(db: DbPort, time: string) {
    const payload = { node_id: 't326-adoption-article', last_opened_at: time };
    await db.transaction(tx => applySyncObjectInTransaction(tx, {
      object_id: payload.node_id, object_type: 'node_open_state', deleted_at: null,
      updated_at: time, payload_json: JSON.stringify(payload),
      content_hash: computeSyncContentHash('node_open_state', payload)
    }));
  }
  const source = new Database(host.fixture.rightSnapshot.databasePath);
  try { await opened(createBetterSqliteDbPort(source), '2030-01-01T00:00:00.000Z'); }
  finally { source.close(); }
  await opened(host.db, '2031-01-01T00:00:00.000Z');
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(await loadSyncGroupOverwriteProgress(host.db)).toBeNull();
  expect(host.sqlite.prepare('SELECT last_opened_at FROM node_open_state WHERE node_id = ?')
    .pluck().get('t326-adoption-article')).toBe('2031-01-01T00:00:00.000Z');
  expect(await readFixtureInventory(host.fixture.left)).toEqual(await readFixtureInventory(host.fixture.right));
}, 20000);

it('keeps missing attachments pending without retransmitting converged database bodies', async () => {
  const host = await adopt();
  await host.sync();
  const { fixture } = host;
  const seeded = await fixture.right.seedResource({ bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
    nodeId: 't326-resource-only', includeImageInBody: true });
  await fs.rm(path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey));
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0, remainingAttachmentResourceCount: 1 });
  const before = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  native.post.mockClear();
  expect(await host.sync()).toMatchObject({ appliedNodeIds: [], pushedNodeIds: [],
    remainingStructureChangeCount: 0, remainingAttachmentResourceCount: 1 });
  expect(native.post.mock.calls.filter(([input]) => ['objects', 'pulls'].includes(new URL(input.url).searchParams.get('request') ?? '')))
    .toEqual([]);
  await expect(fs.stat(path.join(fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey)))
    .rejects.toMatchObject({ code: 'ENOENT' });
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
}, 20000);
