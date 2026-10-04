// @vitest-environment node
import { createECDH, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

let root = '';
let worker: ReturnType<typeof startRestoreFixture> | null = null;
afterEach(async () => {
  await worker?.close();
  worker = null;
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('bounds unauthenticated HTTP admission while preserving approval, rejection and one-time collection', async () => {
  await fs.mkdir('.tmp/artifacts/sync-join', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/sync-join/capacity-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  worker = startRestoreFixture(script, path.join(root, 'Provider'), 0);
  const groupId = `group-${randomUUID()}`;
  const peer = await worker.send('init', { groupId, name: 'Provider' });
  await worker.send('joinProviderEnable');
  const key = createECDH('prime256v1');
  key.generateKeys();
  const input = { contract_version: 1, group_id: groupId,
    ephemeral_public_key: key.getPublicKey().toString('base64url'),
    device: { canonical_library_path: '/tmp/applicant/foliole.db', device_anchor: randomUUID(),
      device_name: 'Applicant', path_flavor: 'posix', platform: 'darwin' } };
  const post = async (route: string, body: unknown) => {
    const response = await fetch(`${peer.origin}/sync-group/${route}`, {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
    });
    return { status: response.status, body: await response.json() as { request_id: string; error?: string } };
  };
  const requests = [];
  for (let index = 0; index < 16; index += 1) {
    const result = await post('join-requests', input);
    expect(result.status).toBe(202);
    requests.push(result.body.request_id);
  }
  for (let index = 0; index < 20; index += 1) {
    expect(await post('join-requests', input)).toMatchObject({
      status: 429, body: { error: 'sync_group_join_capacity_exceeded' }
    });
  }
  const overview = await worker.send('joinOverview') as unknown as { join_requests: unknown[] };
  expect(overview.join_requests).toHaveLength(16);
  expect((await post('join-acceptance', { request_id: requests[0] })).status).toBe(409);
  await worker.send('joinReject', { requestId: requests[1] });
  expect((await post('join-requests', input)).status).toBe(202);
  await worker.send('joinAccept', { requestId: requests[0] });
  const collected = await post('join-acceptance', { request_id: requests[0] });
  expect(collected.status).toBe(200);
  expect(collected.body.request_id).toBe(requests[0]);
  expect((await post('join-acceptance', { request_id: requests[0] })).status).toBe(409);
  expect(await post('join-requests', { ...input, device: {
    ...input.device, device_name: '界'.repeat(6000)
  } })).toMatchObject({ status: 413, body: { error: 'request_too_large' } });
  expect((await post('join-requests', input)).status).toBe(202);
}, 90000);
