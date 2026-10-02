import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

type Overview = { sync_group: { group_id: string } | null; server_status: { port: number | null }; join_requests: Array<{ request_id: string }> };
const invoke = <T>(session: DesktopSession, command: string, args: Record<string, unknown> = {}) =>
  session.firstWindow.evaluate(({ command, args }) => window.electronAPI.invoke(command, args), { command, args }) as Promise<T>;

async function topic(session: DesktopSession) {
  await expectWorkspaceShell(session.firstWindow);
  const previous = await session.firstWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId());
  await session.firstWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => session.firstWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).not.toBe(previous);
  return session.firstWindow.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId()!);
}

async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function persisted(session: DesktopSession, nodeId: string) {
  return session.electronApp.evaluate(({ app }, id) => {
    const pathApi = process.getBuiltinModule('node:path')!;
    const load = process.getBuiltinModule('node:module')!.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const Database = load('better-sqlite3') as typeof import('better-sqlite3');
    const home = process.env.FOLIOLE_LIBRARY_HOME!;
    const db = new Database(pathApi.join(home, 'Data', 'foliole.db'), { readonly: true });
    try { return Boolean(db.prepare('SELECT 1 FROM nodes WHERE id = ? AND deleted_at IS NULL').get(id)); }
    finally { db.close(); }
  }, nodeId);
}

async function candidate(joining: DesktopSession, provider: DesktopSession) {
  const group = await invoke<Overview>(provider, 'create_sync_group');
  await expect.poll(async () => (await invoke<Overview>(provider, 'load_sync_group_overview')).server_status.port).not.toBeNull();
  const port = (await invoke<Overview>(provider, 'load_sync_group_overview')).server_status.port;
  const endpoint = `http://127.0.0.1:${port}`;
  const discovery = await fetch(`${endpoint}/companion/discovery`).then((response) => response.json());
  await joining.electronApp.evaluate(({ app }, input) => {
    const pathApi = process.getBuiltinModule('node:path')!;
    const load = process.getBuiltinModule('node:module')!.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    load(pathApi.join(app.getAppPath(), 'sync', 'desktopSyncGroupJoinState.js')).saveDesktopSyncGroupCandidates([input]);
  }, { ...discovery, endpoint_url: endpoint });
  return group.sync_group!.group_id;
}

async function bindReturnRoute(provider: DesktopSession, joining: DesktopSession) {
  await expect.poll(async () => (await invoke<Overview>(joining, 'load_sync_group_overview')).server_status.port).not.toBeNull();
  const port = (await invoke<Overview>(joining, 'load_sync_group_overview')).server_status.port;
  await provider.electronApp.evaluate(({ app }, endpointUrl) => {
    const pathApi = process.getBuiltinModule('node:path')!;
    const load = process.getBuiltinModule('node:module')!.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const group = load(pathApi.join(app.getAppPath(), 'database', 'syncGroupStore.js')).loadDesktopSyncGroup();
    const peer = group.devices.find((device: { device_identity_key: string }) =>
      device.device_identity_key !== group.local_device_identity_key);
    load(pathApi.join(app.getAppPath(), 'sync', 'desktopSyncGroupRoutes.js')).saveDesktopSyncGroupRoute({
      endpoint_url: endpointUrl, group_id: group.group_id, local_device_id: group.local_device_identity_key,
      peer_device_id: peer.device_identity_key, peer_device_name: peer.device_name, peer_platform: peer.platform
    });
  }, `http://127.0.0.1:${port}`);
}

for (const mode of ['merge', 'overwrite']) {
  test(`chooses ${mode} before joining and applying group data`, async ({ desktopSession }, info) => {
    const provider = await launchDesktopSession({ env: { ...process.env,
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: info.outputPath('provider'),
      FOLIOLE_COMPANION_SYNC_PORT: String(await freePort()) } }) as DesktopSession;
    try {
      await desktopSession.electronApp.evaluate((_electron, port) => {
        process.env.FOLIOLE_COMPANION_SYNC_PORT = String(port);
      }, await freePort());
      await invoke(desktopSession, 'enable_companion_sync');
      const localId = await topic(desktopSession);
      const remoteId = await topic(provider);
      const groupId = await candidate(desktopSession, provider);
      const settings = await openSettingsCategory(desktopSession.firstWindow, 'Sync');
      await settings.getByRole('button', { name: /^(Join|加入)$/ }).click();
      const choice = desktopSession.firstWindow.getByRole('dialog', { name: /^(Join sync group|加入同步组)$/ });
      await expect(choice).toBeVisible();
      expect((await invoke<Overview>(provider, 'load_sync_group_overview')).join_requests).toEqual([]);
      await fs.mkdir('.tmp/artifacts/sync-group-join-mode', { recursive: true });
      const screenshot = await desktopSession.firstWindow.screenshot({ path: path.resolve('.tmp/artifacts/sync-group-join-mode', `${mode}.png`) });
      await info.attach('join-mode-dialog', { body: screenshot, contentType: 'image/png' });
      await choice.getByRole('button', { name: mode === 'merge' ? /^(Merge data|合并资料)$/ : /Use this device’s data to overwrite|用本机资料覆盖整个组/ }).click();
      await expect.poll(async () => (await invoke<Overview>(provider, 'load_sync_group_overview')).join_requests.length).toBe(1);
      const requestId = (await invoke<Overview>(provider, 'load_sync_group_overview')).join_requests[0]!.request_id;
      expect((await invoke<Overview>(desktopSession, 'load_sync_group_overview')).sync_group).toBeNull();
      await invoke(provider, 'accept_sync_group_join_request', { request_id: requestId });
      await expect.poll(async () => (await invoke<Overview>(desktopSession, 'load_sync_group_overview')).sync_group?.group_id).toBe(groupId);
      await bindReturnRoute(provider, desktopSession);
      await invoke(provider, 'sync_companion_now');
      await expect.poll(() => persisted(provider, localId), { timeout: 20000 }).toBe(true);
      expect(await persisted(provider, remoteId)).toBe(mode === 'merge');
      expect(await persisted(desktopSession, localId)).toBe(true);
      await expect.poll(() => persisted(desktopSession, remoteId), { timeout: 20000 }).toBe(mode === 'merge');
    } finally { await provider.close(); }
  });
}
