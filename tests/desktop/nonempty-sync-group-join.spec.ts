import { createServer, type Server } from 'node:net';
import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type WindowPage = DesktopSession['firstWindow'];
type Candidate = {
  endpoint_url: string; group_display_name: string; group_id: string; group_tag: string;
  provider_device_id: string; provider_device_name: string; provider_platform: string;
};

function listenOnRandomPort() {
  return new Promise<Server>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function allocateFreePorts() {
  const servers = await Promise.all([listenOnRandomPort(), listenOnRandomPort()]);
  const ports = servers.map((server) => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing allocated test port.');
    return address.port;
  });
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  return ports;
}

async function createTopic(windowPage: WindowPage) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  const previous = await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await windowPage.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)).not.toBe(previous);
  return await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null) as string;
}

async function invoke<T>(windowPage: WindowPage, command: string, args: Record<string, unknown> = {}) {
  return await windowPage.evaluate(async ({ args, command }) =>
    globalThis.window?.electronAPI?.invoke(command, args), { args, command }) as T;
}

async function hasNode(windowPage: WindowPage, nodeId: string) {
  return await windowPage.evaluate((id) =>
    Boolean(globalThis.window?.__folioleWorkspaceDebug?.getNode?.(id)), nodeId);
}

async function seedDiscoveredCandidate(session: DesktopSession, candidate: Candidate) {
  await session.electronApp.evaluate(({ app }, input) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const loadModule = moduleApi.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const state = loadModule(pathApi.join(app.getAppPath(), 'sync', 'desktopSyncGroupJoinState.js'));
    state.saveDesktopSyncGroupCandidates([input]);
  }, candidate);
}

async function syncDiscoveredPeer(session: DesktopSession, groupId: string, endpointUrl: string) {
  await session.electronApp.evaluate(async ({ app }, input) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const loadModule = moduleApi.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const store = loadModule(pathApi.join(app.getAppPath(), 'database', 'syncGroupStore.js'));
    const routes = loadModule(pathApi.join(app.getAppPath(), 'sync', 'desktopSyncGroupRoutes.js'));
    const transport = loadModule(pathApi.join(app.getAppPath(), 'sync', 'desktopSyncGroupTransport.js'));
    const group = store.loadDesktopSyncGroup();
    const local = group?.devices.find((device: { device_identity_key: string }) =>
      device.device_identity_key === group.local_device_identity_key);
    const peer = group?.devices.find((device: { device_identity_key: string }) =>
      device.device_identity_key !== group.local_device_identity_key);
    if (!local || !peer || group.group_id !== input.groupId) throw new Error('Missing Sync Group Device route.');
    const route = routes.saveDesktopSyncGroupRoute({ endpoint_url: input.endpointUrl,
      group_id: group.group_id, local_device_id: local.device_identity_key,
      peer_device_id: peer.device_identity_key, peer_device_name: peer.device_name,
      peer_platform: peer.platform });
    await transport.continueDesktopSyncGroupSync(route);
  }, { endpointUrl, groupId });
}

async function hasPersistedNode(session: DesktopSession, nodeId: string) {
  return await session.electronApp.evaluate(({ app }, id) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('Missing isolated Library home.');
    const loadModule = moduleApi.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const Database = loadModule('better-sqlite3') as typeof import('better-sqlite3');
    const database = new Database(pathApi.join(libraryHome, 'Data', 'foliole.db'), { readonly: true });
    try {
      return Boolean(database.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id));
    } finally {
      database.close();
    }
  }, nodeId);
}

async function createProvider(session: DesktopSession, windowPage: WindowPage) {
  const topicId = await createTopic(windowPage);
  await expect.poll(() => hasPersistedNode(session, topicId)).toBe(true);
  const overview = await invoke<{ sync_group: { group_id: string } }>(
    windowPage, 'create_sync_group'
  );
  let port: number | null = null;
  await expect.poll(async () => {
    const current = await invoke<{ server_status: { port: number | null; state: string } }>(
      windowPage, 'load_sync_group_overview'
    );
    port = current.server_status.state === 'running' ? current.server_status.port : null;
    return port;
  }).not.toBeNull();
  const endpoint = `http://127.0.0.1:${port}`;
  const discovery = await fetch(`${endpoint}/companion/discovery`).then((response) => response.json()) as {
    group_display_name: string; group_tag: string; provider_device_id: string;
    provider_device_name: string; provider_platform: string;
  };
  return { candidate: {
    endpoint_url: endpoint, group_display_name: discovery.group_display_name,
    group_id: overview.sync_group.group_id, group_tag: discovery.group_tag,
    provider_device_id: discovery.provider_device_id,
    provider_device_name: discovery.provider_device_name,
    provider_platform: discovery.provider_platform
  } satisfies Candidate, topicId };
}

async function restartAndVerify(env: NodeJS.ProcessEnv, groupId: string, nodeIds: string[]) {
  const session = await launchDesktopSession({ env });
  await expectWorkspaceShell(session.firstWindow);
  for (const nodeId of nodeIds) {
    await expect.poll(() => hasPersistedNode(session, nodeId)).toBe(true);
    await expect.poll(() => hasNode(session.firstWindow, nodeId)).toBe(true);
  }
  const overview = await invoke<{ sync_group: { group_id: string } }>(
    session.firstWindow, 'load_sync_group_overview'
  );
  expect(overview.sync_group.group_id).toBe(groupId);
  return session;
}

async function joinAndConverge(args: {
  joiningEnv: NodeJS.ProcessEnv;
  joiningPort: number;
  joiningSession: DesktopSession;
  provider: Awaited<ReturnType<typeof createProvider>>;
  providerSession: DesktopSession;
}) {
  const joiningWindow = args.joiningSession.firstWindow;
  const desktopWindow = args.providerSession.firstWindow;
  await joiningWindow.setViewportSize({ width: 1600, height: 1000 });
  await expectWorkspaceShell(joiningWindow);
  const joiningTopicId = await createTopic(joiningWindow);
  await expect.poll(() => hasPersistedNode(args.joiningSession, joiningTopicId)).toBe(true);
  await invoke(joiningWindow, 'enable_companion_sync');
  await seedDiscoveredCandidate(args.joiningSession, args.provider.candidate);
  await invoke(joiningWindow, 'request_sync_group_join', {
    endpoint_url: args.provider.candidate.endpoint_url
  });
  let requestId: string | null = null;
  await expect.poll(async () => {
    const overview = await invoke<{ join_requests: Array<{ request_id: string }> }>(
      desktopWindow, 'load_sync_group_overview'
    );
    requestId = overview.join_requests[0]?.request_id ?? null;
    return requestId;
  }).not.toBeNull();
  await invoke(desktopWindow, 'accept_sync_group_join_request', { request_id: requestId });
  await invoke(joiningWindow, 'complete_sync_group_join');
  await expect.poll(() => hasPersistedNode(args.joiningSession, args.provider.topicId), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => hasNode(joiningWindow, args.provider.topicId), { timeout: 20_000 }).toBe(true);
  await syncDiscoveredPeer(args.providerSession, args.provider.candidate.group_id,
    `http://127.0.0.1:${args.joiningPort}`);
  await expect.poll(() => hasPersistedNode(args.providerSession, joiningTopicId), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => hasNode(desktopWindow, joiningTopicId), { timeout: 20_000 }).toBe(true);
  await args.joiningSession.close();
  return restartAndVerify(args.joiningEnv, args.provider.candidate.group_id,
    [args.provider.topicId, joiningTopicId]);
}

test('two nonempty desktop Libraries join and converge through ordinary Sync Group sync', async ({ browserName }, testInfo) => {
  void browserName;
  let providerSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  let joiningSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    const [providerPort, joiningPort] = await allocateFreePorts();
    const providerEnv = {
      ...process.env,
      FOLIOLE_COMPANION_SYNC_PORT: String(providerPort),
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('provider-state')
    };
    providerSession = await launchDesktopSession({ env: providerEnv });
    const desktopSession = providerSession;
    const desktopWindow = providerSession.firstWindow;
    await desktopWindow.setViewportSize({ width: 1600, height: 1000 });
    await expectWorkspaceShell(desktopWindow);
    const provider = await createProvider(desktopSession, desktopWindow);
    const joiningEnv = {
      ...process.env,
      FOLIOLE_COMPANION_SYNC_PORT: String(joiningPort),
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('joining-state')
    };
    joiningSession = await launchDesktopSession({ env: joiningEnv });
    joiningSession = await joinAndConverge({
      joiningEnv, joiningPort, joiningSession, provider, providerSession
    });
  } catch (error) {
    if (providerSession) {
      await testInfo.attach('provider-desktop-diagnostics', {
        body: JSON.stringify(await providerSession.collectDiagnostics(), null, 2),
        contentType: 'application/json'
      });
    }
    if (joiningSession) {
      await testInfo.attach('joining-desktop-diagnostics', {
        body: JSON.stringify(await joiningSession.collectDiagnostics(), null, 2),
        contentType: 'application/json'
      });
    }
    throw error;
  } finally {
    await joiningSession?.close();
    await providerSession?.close();
  }
});
