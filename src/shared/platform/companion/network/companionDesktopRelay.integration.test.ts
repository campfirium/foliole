// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { buildDesktopFramedSyncFixture } from '../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract.js';
import { syncSessionReplySchema } from '../../../../../lib/platform/syncSessionContract.js';
import { createCompanionRequestFixture, native } from '../../../../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../../../../test/companionSessionHttp.testSupport.js';

import { closeCompanionDesktopSession, ensureCompanionDesktopSession, subscribeCompanionDesktopChanges,
  waitForCompanionDesktopChanges } from './companionDesktopSession.js';
import { requestCompanionSyncSession } from './companionSyncSessionHttp.js';

// Native signing and HTTP/decryption run in Node; scheduling and data transfer use production TS.
vi.mock('./signedRequest.js', () => ({ createSignedRequestHeaders: async (input: {
  endpointUrl: string; method: string; pathWithQuery: string
}) => (await native.sign({ endpoint_url: input.endpointUrl, method: input.method,
  path_with_query: input.pathWithQuery, sync_group_id: 't326-group' })).headers }));

let buildRoot: string;
beforeAll(async () => { buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-phone-relay-build-')); });
afterAll(async () => { if (buildRoot) await fs.rm(buildRoot, { recursive: true, force: true }); });

function readDesktop(databasePath: string, nodeId: string, column: 'content' | 'current_version_id') {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return db.prepare(`SELECT ${column} FROM nodes WHERE id = ?`).pluck().get(nodeId); }
  finally { db.close(); }
}

it('relays phone edits through the connected desktop to another desktop and back', { meta: { calibratedMs: 90_000 } }, async () => {
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const mobile = await createCompanionRequestFixture(script);
  installSessionHttpBoundary();
  const desktopA = mobile.fixture.right;
  const snapshotA = mobile.fixture.rightSnapshot;
  const desktopB = await mobile.fixture.startThird();
  let unsubscribe = () => {};
  try {
    await desktopA.invoke('activation_start');
    await desktopA.invoke('activation_found', { origin: desktopB.snapshot.origin });
    await desktopB.process.invoke('activation_start');
    await desktopB.process.invoke('activation_found', { origin: snapshotA.origin });
    const target = { endpointUrl: snapshotA.origin, deviceId: snapshotA.deviceId, groupId: 't326-group',
      platform: 'darwin', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
    await ensureCompanionDesktopSession(snapshotA.origin, snapshotA.deviceId, { target, libraryEpoch: `${snapshotA.deviceId}-epoch` });

    await mobile.fixture.left.seed({ nodeId: 'relay-node', title: 'Relay', content: 'Written on phone' });
    await mobile.sync();
    await expect.poll(() => readDesktop(desktopB.snapshot.databasePath, 'relay-node', 'content'), {
      timeout: 10_000, interval: 50 }).toBe('Written on phone');

    let delivered!: () => void;
    const received = new Promise<void>(resolve => { delivered = resolve; });
    unsubscribe = subscribeCompanionDesktopChanges(async () => {
      await mobile.sync();
      if (mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('relay-node') === 'Edited on B') delivered();
    });
    waitForCompanionDesktopChanges();
    await desktopB.process.invoke('local_content_edit', { nodeId: 'relay-node',
      baseVersionId: readDesktop(desktopB.snapshot.databasePath, 'relay-node', 'current_version_id'),
      versionId: 'relay-b-version', content: 'Edited on B', hostName: 'Desktop B', updatedAt: '2026-10-22T02:00:00Z' });
    await received;
    expect(readDesktop(snapshotA.databasePath, 'relay-node', 'content')).toBe('Edited on B');
    await mobile.restart();
    expect(mobile.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('relay-node')).toBe('Edited on B');
  } finally {
    unsubscribe();
    await closeCompanionDesktopSession();
    await desktopB.process.close();
    await mobile.close();
  }
});


it('tells a phone on one desktop about a higher-priority desktop that took the foreground', { meta: { calibratedMs: 90_000 } }, async () => {
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const mobile = await createCompanionRequestFixture(script);
  installSessionHttpBoundary();
  const desktopA = { process: mobile.fixture.right, snapshot: mobile.fixture.rightSnapshot };
  const desktopB = await mobile.fixture.startThird();
  try {
    for (const desktop of [desktopA, desktopB]) await desktop.process.invoke('activation_start');
    for (const [desktop, peer] of [[desktopA, desktopB], [desktopB, desktopA]] as const) {
      await desktop.process.invoke('activation_found', { origin: peer.snapshot.origin });
    }
    const opened = syncSessionReplySchema.parse(await requestCompanionSyncSession(desktopA.snapshot.origin, { operation: 'open' }));
    expect(opened.tier).toBe(1);

    await desktopB.process.invoke('activation_foreground', { foreground: true });
    await expect.poll(async () => (await (await fetch(`${desktopB.snapshot.origin}/companion/discovery`)).json()).foreground,
      { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => syncSessionReplySchema.parse(await requestCompanionSyncSession(desktopA.snapshot.origin, {
      operation: 'wait', session: opened.session, marker: opened.marker })).best, { timeout: 30_000 })
      .toEqual({ device_id: desktopB.snapshot.deviceId, tier: 2 });
  } finally {
    await desktopB.process.close();
    await mobile.close();
  }
});
