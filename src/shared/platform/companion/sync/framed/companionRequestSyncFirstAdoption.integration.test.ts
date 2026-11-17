// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { deletePermanently, nodeTraces } from '../../../../../../electron/sync/syncHistoryHorizon.testSupport.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { hostedAttachments, hostedLegalVersion } from '../../../../../../scripts/ios/ios-hosted-request-seed-data.js';
import { seedIosHostedRequestLibrary } from '../../../../../../scripts/ios/ios-hosted-request-seed.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

it('finishes first adoption into an empty companion and sends a later local capture', { meta: { calibratedMs: 20000 } }, async () => {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await fixture.right.seed({ content: 'Provider body', nodeId: 't326-first-adoption-source', title: 'Provider' });
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  await fixture.left.seed({ content: 'Local capture', nodeId: 't326-first-adoption-capture', title: 'Capture' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0,
    pushedNodeIds: expect.arrayContaining(['t326-first-adoption-capture']) });
  await host.restart();
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual([
      expect.objectContaining({ id: 't326-first-adoption-capture', content: 'Local capture' }),
      expect.objectContaining({ id: 't326-first-adoption-source', content: 'Provider body' })
    ]);
  }
});

it('adopts and reopens with a permanent deletion and no downloaded version history', async () => {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  const id = 'first-adoption-deleted';
  const provider = fixture.rightSnapshot;
  for (const content of ['First draft', 'Second draft']) {
    await fixture.right.seed({ nodeId: id, content, title: 'Deleted material' });
  }
  deletePermanently(provider.databasePath, id, new Date().toISOString());
  expect(nodeTraces(provider.databasePath, id).versions).toBeGreaterThan(1);
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: provider.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: provider.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  await host.restart();
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(nodeTraces(fixture.leftSnapshot.databasePath, id)).toEqual({ node: 0, tombstone: 1, versions: 0, inventory: 1 });
});

it('leaves only the three unavailable attachments pending in the iOS content corpus', { meta: { calibratedMs: 20000 } }, async () => {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  const provider = new Database(fixture.rightSnapshot.databasePath);
  try { await seedIosHostedRequestLibrary(createBetterSqliteDbPort(provider), 'contentResource'); }
  finally { provider.close(); }
  const assets = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets');
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, `${hostedAttachments.valid.hash}.pdf`), Buffer.from(hostedAttachments.valid.base64, 'base64'));
  await writeFile(path.join(assets, `${hostedAttachments.corrupt.hash}.png`), 'corrupt-delivery');
  const localAssets = path.join(fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets');
  await mkdir(localAssets, { recursive: true });
  await writeFile(path.join(localAssets, `${hostedAttachments.valid.hash}.pdf`), Buffer.from(hostedAttachments.valid.base64, 'base64'));
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0, remainingAttachmentResourceCount: 3 });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
});

it('finishes first adoption from the historical iOS acceptance corpus', { meta: { calibratedMs: 20000 } }, async () => {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  const provider = new Database(fixture.rightSnapshot.databasePath);
  try { await seedIosHostedRequestLibrary(createBetterSqliteDbPort(provider), 'legal'); }
  finally { provider.close(); }
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  const result = await host.sync();
  expect(result).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  const source = new Database(fixture.rightSnapshot.databasePath);
  try {
    expect(source.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(hostedLegalVersion.version_id))
      .toMatchObject(hostedLegalVersion);
    expect(await host.db.query('SELECT version_id, content_hash, body_text FROM node_sync_versions WHERE version_id = ?',
      [hostedLegalVersion.version_id])).toEqual([{
      version_id: hostedLegalVersion.version_id, content_hash: hostedLegalVersion.content_hash, body_text: hostedLegalVersion.body_text
    }]);
  } finally { source.close(); }
  await fixture.left.seed({ content: 'Local capture', nodeId: 't326-historical-capture', title: 'Capture' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0,
    pushedNodeIds: expect.arrayContaining(['t326-historical-capture']) });
});
