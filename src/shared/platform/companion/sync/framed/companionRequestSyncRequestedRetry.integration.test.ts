// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopSyncGroupSignedHeaders } from '../../../../../../electron/sync/desktopSyncGroupSignedHeaders.js';
import { encryptWorkgroupPayloadNode } from '../../../../../../electron/sync/workgroupAeadNode.js';
import { desktopWorkgroupTag } from '../../../../../../electron/sync/workgroupKeyStore.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';
import { loadCompanionSyncGroupMemberState } from '../syncGroupMemberStateStore.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

const bodies = [{ label: 'empty', content: '' },
  { label: 'BOM Unicode NUL CRLF', content: '\ufeff---\r\n中文😀\0\r\n---\r\n' + '中😀'.repeat(149_000) }];
const cases = bodies.flatMap(body => [false, true].map(restartSender => ({ ...body, restartSender })));

it.each(cases)('retries $label after receiver restart and sender restart=$restartSender', { meta: { calibratedMs: 30000 } }, async ({ content, restartSender }) => {
  host = await createCompanionRequestFixture();
  const current = host;
  const { fixture } = current;
  const nodeId = 't326-invalidated-request';
  await fixture.right.seed({ nodeId, title: 'Retry', content });
  const sourceBefore = readFacts(fixture.rightSnapshot.databasePath);
  let interrupted = false;
  native.post.mockImplementation(async input => {
    const response = await current.post(input);
    if (!interrupted && new URL(input.url).searchParams.get('request') === 'pulls') {
      interrupted = true;
      throw new Error('fixture_receiver_before_apply_failure');
    }
    return response;
  });

  await expect(current.sync()).rejects.toThrow('fixture_receiver_before_apply_failure');
  expect(interrupted).toBe(true);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes).toEqual([]);
  expect(readFacts(fixture.rightSnapshot.databasePath)).toEqual(sourceBefore);
  await current.restart();
  if (restartSender) {
    fixture.rightSnapshot = (await fixture.restartRight()).snapshot;
    await exchangeMembership(current);
  }
  expect(readFacts(fixture.rightSnapshot.databasePath)).toEqual(sourceBefore);
  native.post.mockImplementation(current.post);

  expect(await current.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  const applied = readFacts(fixture.leftSnapshot.databasePath);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ id: nodeId, content })]);
  expect(applied.versions.map(versionIdentity))
    .toEqual(sourceBefore.versions.map(versionIdentity));
  expect(applied.parents).toEqual(sourceBefore.parents);
  await current.sync();
  await current.restart();
  expect(readFacts(fixture.leftSnapshot.databasePath)).toEqual(applied);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ id: nodeId, content })]);
});

function readFacts(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    return {
      versions: db.prepare(`SELECT version_id, object_id, parent_version_id, host_name, created_at,
        content_hash, body_text, snapshot_json FROM node_sync_versions
        WHERE object_id = 't326-invalidated-request' ORDER BY version_id`)
        .all() as Array<{ snapshot_json: string; [key: string]: unknown }>,
      parents: db.prepare(`SELECT * FROM node_sync_version_parents WHERE version_id IN
        (SELECT version_id FROM node_sync_versions WHERE object_id = 't326-invalidated-request')
        ORDER BY version_id, ordinal`).all()
    };
  } finally { db.close(); }
}

function versionIdentity(row: { snapshot_json: string; [key: string]: unknown }) {
  const { snapshot_json, ...identity } = row;
  expect(JSON.parse(snapshot_json)).toMatchObject({ id: 't326-invalidated-request', title: 'Retry' });
  return identity;
}

async function exchangeMembership(current: Awaited<ReturnType<typeof createCompanionRequestFixture>>) {
  const secret = Buffer.alloc(32, 7).toString('base64url');
  const pathWithQuery = '/sync-group/member-state';
  const body = JSON.stringify(encryptWorkgroupPayloadNode({ groupKey: secret,
    context: { contentType: 'application/json; charset=utf-8', direction: 'request',
      groupTag: desktopWorkgroupTag(secret), method: 'POST', pathWithQuery },
    plaintext: Buffer.from(JSON.stringify(await loadCompanionSyncGroupMemberState())) }));
  const response = await fetch(`${current.fixture.rightSnapshot.origin}${pathWithQuery}`, {
    method: 'POST', body, headers: {
      ...createDesktopSyncGroupSignedHeaders({ groupId: 't326-group', secret, body, method: 'POST',
        localDeviceId: current.fixture.leftSnapshot.deviceId, pathWithQuery }),
      'Content-Type': 'application/vnd.foliole.workgroup-aead+json'
    }
  });
  expect(response.status).toBe(200);
  await response.arrayBuffer();
}
