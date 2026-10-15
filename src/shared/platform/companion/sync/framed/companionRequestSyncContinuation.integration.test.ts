// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { readFixtureInventory } from '../../../../../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport.js';
import { buildDesktopFramedSyncFixture, readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';


let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });
async function setup() { host = await createCompanionRequestFixture(); return host; }

it('receives a remote edit, converges inventories and does not manufacture alternatives', async () => {
  const host = await setup();
  const { fixture } = host;
  const nodeId = 't326-continuation-topic';
  await fixture.left.seed({ content: 'Original', nodeId, title: 'Original' });
  await host.sync();
  await fixture.right.seed({ content: 'Remote saved edit😀', nodeId, title: 'Remote edit' });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0, appliedNodeIds: expect.arrayContaining([nodeId]) });
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ content: 'Remote saved edit😀' })]);
    const db = new Database(snapshot.databasePath, { readonly: true });
    try { expect(db.prepare('SELECT count(*) FROM node_text_alternatives WHERE node_id = ?').pluck().get(nodeId)).toBe(0); }
    finally { db.close(); }
  }
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}, 20000);

it('converges a fork after the shared ancestor body was deleted', async () => {
  const host = await setup();
  const { fixture } = host;
  const nodeId = 't326-ancestor-fork';
  await fixture.left.seed({ content: 'Shared original', nodeId, title: 'Shared' });
  await host.sync();
  await fixture.left.seed({ content: 'Companion complete input', nodeId, title: 'Shared' });
  await fixture.right.seed({ content: 'Desktop advanced input', nodeId, title: 'Shared' });
  const source = new Database(fixture.rightSnapshot.databasePath);
  try {
    expect(source.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_deleted', json('true'))
      WHERE object_id = ? AND body_text = 'Shared original'`).run(nodeId).changes).toBe(1);
  } finally { source.close(); }
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  const right = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
  try {
    const versions = 'SELECT version_id, parent_version_id, content_hash, body_text FROM node_sync_versions WHERE object_id = ? ORDER BY version_id';
    expect(right.prepare(versions).all(nodeId)).toEqual(host.sqlite.prepare(versions).all(nodeId));
    expect(host.sqlite.prepare(versions).all(nodeId)).toContainEqual(expect.objectContaining({ body_text: 'Companion complete input' }));
    expect(host.sqlite.prepare(versions).all(nodeId)).toContainEqual(expect.objectContaining({ body_text: null }));
    expect(right.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get(nodeId))
      .toEqual(host.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get(nodeId));
  } finally { right.close(); }
}, 20000);

it('recaptures an edit saved after a selected response was fixed', async () => {
  const host = await setup();
  const { fixture } = host;
  const nodeId = 't326-late-edit';
  await fixture.right.seed({ content: 'Fixed body', nodeId, title: 'Fixed' });
  let edited = false;
  native.post.mockImplementation(async input => {
    const response = await host.post(input);
    if (!edited && new URL(input.url).searchParams.get('request') === 'pulls') {
      edited = true;
      await fixture.right.seed({ content: 'Later saved body', nodeId, title: 'Later' });
    }
    return response;
  });
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(edited).toBe(true);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Later saved body' })]);
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}, 20000);

it('keeps later saved text after a lost response and source restart', async () => {
  const host = await setup();
  const { fixture } = host;
  const nodeId = 't326-lost-response';
  await fixture.left.seed({ content: 'Fixed original', nodeId, title: 'Original' });
  let lost = false;
  native.post.mockImplementation(async input => {
    const response = await host.post(input);
    if (!lost && new URL(input.url).searchParams.get('request') === 'objects') {
      lost = true;
      throw new Error('fixture_response_lost');
    }
    return response;
  });
  await expect(host.sync()).rejects.toThrow('fixture_response_lost');
  expect(lost).toBe(true);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Fixed original' })]);
  await fixture.left.seed({ content: 'Later saved after lost response', nodeId, title: 'Later' });
  await host.restart();
  native.post.mockImplementation(host.post);
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ content: 'Later saved after lost response' })]);
  }
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}, 20000);

it('leaves an unavailable body pending while committing its neighbor and converges after repair', async () => {
  const host = await setup();
  const { fixture } = host;
  for (const nodeId of ['t326-unavailable', 't326-neighbor']) {
    await fixture.left.seed({ content: 'Initial body', nodeId, title: nodeId });
  }
  await host.sync();
  await fixture.left.seed({ content: 'Unavailable edit', nodeId: 't326-unavailable', title: 'Unavailable' });
  await fixture.left.seed({ content: 'Independent edit', nodeId: 't326-neighbor', title: 'Independent' });
  const update = host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?, snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id =
    (SELECT current_version_id FROM nodes WHERE id = 't326-unavailable')`);
  update.run(null);
  native.post.mockClear();
  expect((await host.sync()).remainingStructureChangeCount).toBeGreaterThan(0);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes).toEqual([
    expect.objectContaining({ id: 't326-neighbor', content: 'Independent edit' }),
    expect.objectContaining({ id: 't326-unavailable', content: 'Initial body' })
  ]);
  expect(native.post.mock.calls.filter(([input]) => new URL(input.url).searchParams.get('request') === 'objects').length)
    .toBeLessThanOrEqual(8);
  update.run('Unavailable edit');
  expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ id: 't326-unavailable', content: 'Unavailable edit' }));
}, 20000);

it('keeps an available desktop convergent beside a busy mobile peer and resumes the companion production request path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-activation-mobile-'));
  const script = path.join(root, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const host = await createCompanionRequestFixture(script);
  const { fixture } = host;
  const third = await fixture.startThird();
  try {
    await fixture.right.invoke('activation_start');
    await fixture.left.seed({ nodeId: 't326-mobile-input', title: 'Mobile', content: 'Before activation' });
    await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
    await fixture.right.invoke('activation_found', { origin: third.snapshot.origin });
    await fixture.right.seed({ nodeId: 't326-later-edit', title: 'Desktop', content: 'After activation' });
    await fixture.left.invoke('activation_hold_round', { peerId: fixture.rightSnapshot.deviceId });
    expect(await fixture.right.invoke('activation_manual')).toMatchObject({ status: 'pending' });
    expect(readDesktopFramedSyncLibraryEvidence(third.snapshot.databasePath).nodes)
      .toContainEqual(expect.objectContaining({ id: 't326-later-edit', content: 'After activation' }));
    await fixture.left.invoke('activation_release_round');
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
      .toContainEqual(expect.objectContaining({ id: 't326-later-edit', content: 'After activation' }));
    await fixture.left.seed({ nodeId: 't326-mobile-input', title: 'Mobile', content: 'Mobile edited' });
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
      .toContainEqual(expect.objectContaining({ id: 't326-mobile-input', content: 'Mobile edited' }));
  } finally {
    await third.process.close();
    await host.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}, 60_000);
