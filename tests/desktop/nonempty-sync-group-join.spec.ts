import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type WindowPage = DesktopSession['firstWindow'];
type Candidate = {
  endpoint_url: string;
  group_display_name: string;
  group_id: string;
  provider_device_id: string;
  provider_device_kind: string;
  provider_device_name: string;
  timeline_id: string;
};

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
    const store = loadModule(pathApi.join(app.getAppPath(), 'sync', 'companionPairingStore.js'));
    const sync = loadModule(pathApi.join(app.getAppPath(), 'sync', 'desktopSyncGroupJoin.js'));
    const peer = store.loadPairedSyncGroupPeers(input.groupId)[0];
    if (!peer) throw new Error('Missing paired Sync Group peer.');
    await sync.continueDesktopSyncGroupSync(store.savePairedSyncGroupPeer({
      ...peer, endpoint_url: input.endpointUrl
    }));
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
  const overview = await invoke<{ sync_group: { group_id: string; timeline_id: string } }>(
    windowPage, 'create_sync_group'
  );
  let port: number | null = null;
  await expect.poll(async () => {
    const current = await invoke<{ server_status: { port: number | null; state: string } }>(
      windowPage, 'load_companion_pairing_overview'
    );
    port = current.server_status.state === 'running' ? current.server_status.port : null;
    return port;
  }).not.toBeNull();
  const endpoint = `http://127.0.0.1:${port}`;
  const discovery = await fetch(`${endpoint}/companion/discovery`).then((response) => response.json()) as {
    desktop_device_name: string; desktop_platform: string;
    group_display_name: string; peer_id: string;
  };
  return { candidate: {
    endpoint_url: endpoint, group_display_name: discovery.group_display_name,
    group_id: overview.sync_group.group_id, provider_device_id: discovery.peer_id,
    provider_device_kind: `desktop-${discovery.desktop_platform.toLowerCase()}`,
    provider_device_name: discovery.desktop_device_name,
    timeline_id: overview.sync_group.timeline_id
  } satisfies Candidate, topicId };
}

async function restartAndVerify(
  env: NodeJS.ProcessEnv,
  groupId: string,
  nodeIds: string[]
) {
  const session = await launchDesktopSession({ env });
  await expectWorkspaceShell(session.firstWindow);
  for (const nodeId of nodeIds) {
    await expect.poll(() => hasPersistedNode(session, nodeId)).toBe(true);
    await expect.poll(() => hasNode(session.firstWindow, nodeId)).toBe(true);
  }
  const overview = await invoke<{ sync_group: { group_id: string } }>(
    session.firstWindow, 'load_companion_pairing_overview'
  );
  expect(overview.sync_group.group_id).toBe(groupId);
  return session;
}

test('two nonempty desktop Libraries join and converge through ordinary Sync Group sync', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  let joiningSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(desktopWindow);
    const provider = await createProvider(desktopSession, desktopWindow);
    const groupId = provider.candidate.group_id;

    const joiningEnv = {
      ...process.env,
      FOLIOLE_COMPANION_SYNC_PORT: '38642',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('joining-state')
    };
    joiningSession = await launchDesktopSession({ env: joiningEnv });
    const joiningWindow = joiningSession.firstWindow;
    await joiningWindow.setViewportSize({ width: 1600, height: 1000 });
    await expectWorkspaceShell(joiningWindow);
    const joiningTopicId = await createTopic(joiningWindow);
    await expect.poll(() => hasPersistedNode(joiningSession!, joiningTopicId)).toBe(true);
    await invoke(joiningWindow, 'enable_companion_sync');
    const candidate = provider.candidate;
    await seedDiscoveredCandidate(joiningSession, candidate);
    await invoke(joiningWindow, 'request_sync_group_join', { endpoint_url: candidate.endpoint_url });
    let requestId: string | null = null;
    await expect.poll(async () => {
      const overview = await invoke<{ pending_requests: Array<{ pair_request_id: string }> }>(
        desktopWindow, 'load_companion_pairing_overview'
      );
      requestId = overview.pending_requests[0]?.pair_request_id ?? null;
      return requestId;
    }).not.toBeNull();
    await invoke(desktopWindow, 'approve_companion_pair_request', { pair_request_id: requestId });
    await invoke(joiningWindow, 'complete_sync_group_join');

    await expect.poll(() => hasPersistedNode(joiningSession!, provider.topicId), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => hasNode(joiningWindow, provider.topicId), { timeout: 20_000 }).toBe(true);
    await syncDiscoveredPeer(desktopSession, groupId, 'http://127.0.0.1:38642');
    await expect.poll(() => hasPersistedNode(desktopSession, joiningTopicId), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => hasNode(desktopWindow, joiningTopicId), { timeout: 20_000 }).toBe(true);
    const joined = await invoke<{ sync_group: { group_id: string } }>(
      joiningWindow, 'load_companion_pairing_overview'
    );
    expect(joined.sync_group.group_id).toBe(groupId);
    await joiningSession.close();
    joiningSession = await restartAndVerify(joiningEnv, groupId, [provider.topicId, joiningTopicId]);
  } catch (error) {
    if (joiningSession) {
      await testInfo.attach('joining-desktop-diagnostics', {
        body: JSON.stringify(await joiningSession.collectDiagnostics(), null, 2),
        contentType: 'application/json'
      });
    }
    throw error;
  } finally {
    await joiningSession?.close();
  }
});
