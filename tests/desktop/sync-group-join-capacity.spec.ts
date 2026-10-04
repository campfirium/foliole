import { createECDH, randomUUID } from 'node:crypto';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type Overview = { sync_group: { group_id: string }; server_status: { port: number | null };
  join_requests: Array<{ request_id: string }> };

test('keeps join admission bounded and approved requests collectible in the native host', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const invoke = (command: string, args: Record<string, unknown> = {}) =>
    desktopWindow.evaluate(({ command, args }) => window.electronAPI.invoke(command, args), { command, args });
  const group = await invoke('create_sync_group') as Overview;
  await expect.poll(async () => (await invoke('load_sync_group_overview') as Overview).server_status.port).not.toBeNull();
  const overview = await invoke('load_sync_group_overview') as Overview;
  const key = createECDH('prime256v1');
  key.generateKeys();
  const input = { contract_version: 1, group_id: group.sync_group.group_id,
    ephemeral_public_key: key.getPublicKey().toString('base64url'),
    device: { canonical_library_path: '/tmp/applicant/foliole.db', device_anchor: randomUUID(),
      device_name: 'Applicant', path_flavor: 'posix', platform: 'darwin' } };
  const post = async (route: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${overview.server_status.port}/sync-group/${route}`, {
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
  expect(await post('join-requests', input)).toMatchObject({
    status: 429, body: { error: 'sync_group_join_capacity_exceeded' }
  });
  expect((await invoke('load_sync_group_overview') as Overview).join_requests).toHaveLength(16);
  await invoke('accept_sync_group_join_request', { request_id: requests[0] });
  expect((await post('join-acceptance', { request_id: requests[0] })).status).toBe(200);
  expect((await post('join-acceptance', { request_id: requests[0] })).status).toBe(409);
  await invoke('reject_sync_group_join_request', { request_id: requests[1] });
  expect((await invoke('load_sync_group_overview') as Overview).join_requests).toHaveLength(14);
  expect((await post('join-requests', input)).status).toBe(202);
});
