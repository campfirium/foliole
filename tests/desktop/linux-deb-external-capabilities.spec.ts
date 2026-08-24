import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Bonjour } from 'bonjour-service';

import {
  createTestPairingKeyPair,
  decryptTestPairingSecret
} from '../../electron/sync/companionPairingProtocolTestSupport.js';
import { createDesktopSyncGroupSignedHeaders } from '../../electron/sync/desktopSyncGroupSignedHeaders.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';

const ACCOUNT_ID = '023e105f4ecef8ad9ca31a8372d0c353';
const API_TOKEN = 'Sn3lZJTBX6kkg7OdcBUAxOO963GEIyGQqnFTOFYY';
const DEVICE_ID = 'linux-deb-acceptance-device';

function jsonHeaders() {
  return { 'content-type': 'application/json' };
}

async function discoverFolioleService() {
  const bonjour = new Bonjour();
  try {
    return await new Promise<{ port: number; txt: Record<string, string> }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Foliole mDNS service was not discovered')), 10_000);
      bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, (service) => {
        clearTimeout(timeout);
        resolve({ port: service.port, txt: service.txt as Record<string, string> });
      });
    });
  } finally {
    bonjour.destroy();
  }
}

async function expectSignedWorkspaceVersion(
  endpoint: string,
  paired: { deviceId: string; groupId: string; secret: string }
) {
  const pathWithQuery = '/companion/workspace-version';
  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    headers: createDesktopSyncGroupSignedHeaders({
      groupId: paired.groupId,
      localDeviceId: paired.deviceId,
      method: 'GET',
      pathWithQuery,
      secret: paired.secret
    })
  });
  expect(response.status).toBe(200);
}

async function pairCompanion(
  windowPage: DesktopSession['firstWindow'],
  endpoint: string,
  group: { groupId: string; groupTag: string; timelineId: string }
) {
  const keyPair = await createTestPairingKeyPair();
  const created = await fetch(`${endpoint}/companion/pair-requests`, {
    body: JSON.stringify({
      device_id: DEVICE_ID,
      device_kind: 'android',
      device_name: 'Linux DEB acceptance',
      group_id: group.groupId,
      group_tag: group.groupTag,
      library_facts: {
        attachment_count: 0, content_blob_count: 0, node_count: 0,
        review_log_count: 0, timeline_id: null
      },
      pairing_public_key: keyPair.publicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      timeline_id: group.timelineId
    }),
    headers: jsonHeaders(),
    method: 'POST'
  });
  expect(created.status).toBe(202);
  const pairRequestId = String((await created.json() as { pair_request_id: string }).pair_request_id);
  await windowPage.evaluate((id) => window.electronAPI?.invoke(
    'approve_companion_pair_request', { pair_request_id: id }
  ), pairRequestId);
  const finalized = await fetch(`${endpoint}/companion/pair`, {
    body: JSON.stringify({ pair_request_id: pairRequestId }),
    headers: jsonHeaders(),
    method: 'POST'
  });
  expect(finalized.status).toBe(200);
  const payload = await finalized.json() as {
    device_id: string;
    encrypted_device_secret: Parameters<typeof decryptTestPairingSecret>[0]['encrypted'];
  };
  const secret = await decryptTestPairingSecret({
    encrypted: payload.encrypted_device_secret, privateKey: keyPair.privateKey
  });
  return { deviceId: payload.device_id, groupId: group.groupId, secret };
}

async function pairDiscoveredGroup(windowPage: DesktopSession['firstWindow'], endpoint: string) {
  const group = await fetch(`${endpoint}/companion/discovery`).then((response) => response.json()) as {
    group_id: string; group_tag: string; timeline_id: string;
  };
  return pairCompanion(windowPage, endpoint, {
    groupId: group.group_id, groupTag: group.group_tag, timelineId: group.timeline_id
  });
}

async function expectExternalCapabilities(session: DesktopSession) {
  const status = await session.firstWindow.evaluate(() => window.electronAPI?.invoke('assistant_get_status'));
  expect(status).toMatchObject({ provider: 'codex-app-server', state: 'ready' });
  const security = await session.electronApp.evaluate(({ safeStorage }) => ({
    available: safeStorage.isEncryptionAvailable(),
    backend: safeStorage.getSelectedStorageBackend()
  }));
  expect(security.available).toBe(true);
  expect(security.backend).not.toBe('basic_text');
}

async function launchAssistantStatus(
  source: DesktopSession,
  env: NodeJS.ProcessEnv
) {
  const session = await launchDesktopSession({
    env: {
      ...source.launchOptions.env,
      ...env,
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: `${source.target.runtimeStateRoot}-${crypto.randomUUID()}`
    }
  }) as DesktopSession;
  try {
    return await session.firstWindow.evaluate(() => window.electronAPI?.invoke('assistant_get_status'));
  } finally {
    await session.close();
  }
}

test('installed Linux diagnoses Codex PATH, missing, incompatible, and signed-out states', async ({
  desktopSession
}) => {
  const fixtureDirectory = desktopSession.launchOptions.env.FOLIOLE_CODEX_PATH_FIXTURE_DIR;
  expect(fixtureDirectory).toBeTruthy();
  await closeDesktopApplication(desktopSession.electronApp);
  const basePath = '/usr/bin:/bin';
  await expect(launchAssistantStatus(desktopSession, {
    FOLIOLE_CODEX_COMMAND: '',
    PATH: `${fixtureDirectory}:${basePath}`
  })).resolves.toMatchObject({ state: 'ready' });
  await expect(launchAssistantStatus(desktopSession, {
    FOLIOLE_CODEX_COMMAND: '',
    PATH: basePath
  })).resolves.toMatchObject({ failure: { category: 'not_configured' } });
  await expect(launchAssistantStatus(desktopSession, {
    FOLIOLE_CODEX_COMMAND: path.join(fixtureDirectory!, 'incompatible-codex'),
    PATH: basePath
  })).resolves.toMatchObject({ failure: { category: 'launch_failed' } });
  await expect(launchAssistantStatus(desktopSession, {
    FOLIOLE_CODEX_COMMAND: path.join(fixtureDirectory!, 'external-codex-fixture.mjs'),
    FOLIOLE_CODEX_FIXTURE_AUTH: 'missing',
    PATH: basePath
  })).resolves.toMatchObject({ failure: { category: 'auth_failed' } });
});

test('installed Linux capabilities use external Codex, loopback control, LAN sync, and system secrets', async ({
  desktopSession,
  desktopWindow
}) => {
  let relaunched: DesktopSession | null = null;
  const stateRoot = desktopSession.target.runtimeStateRoot;
  try {
    await expectExternalCapabilities(desktopSession);
    const publish = await desktopWindow.evaluate(({ accountId, token }) => window.electronAPI?.invoke(
      'save_foliole_publish_draft',
      { settings: { account_id: accountId, api_token: token, project_name: 'linux-deb-acceptance' } }
    ), { accountId: ACCOUNT_ID, token: API_TOKEN });
    expect(publish).toMatchObject({ credentials_valid: true, has_credentials: true });

    const descriptor = JSON.parse(await readFile(path.join(
      stateRoot, 'user-data', 'cache', 'agent-control-session.json'
    ), 'utf8')) as { endpoint: string; token: string };
    expect(descriptor.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect((await fetch(`${descriptor.endpoint}/agent-control/v1/capabilities`)).status).toBe(401);
    const authorized = await fetch(`${descriptor.endpoint}/agent-control/v1/capabilities`, {
      headers: { authorization: `Bearer ${descriptor.token}` }
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.text()).not.toContain(descriptor.token);

    const discovery = discoverFolioleService();
    const overview = await desktopWindow.evaluate(() => window.electronAPI?.invoke('create_sync_group')) as {
      server_status: { advertised_urls: string[]; last_error: string | null; port: number; state: string };
      sync_group: { local_member_state: string };
    };
    expect(overview.sync_group).toMatchObject({ local_member_state: 'active' });
    expect(overview.server_status).toMatchObject({ last_error: null, state: 'running' });
    const service = await discovery;
    expect(service).toMatchObject({ port: overview.server_status.port });
    expect(service.txt.protocol_version).toBe('1');
    const endpoint = `http://127.0.0.1:${overview.server_status.port}`;
    const paired = await pairDiscoveredGroup(desktopWindow, endpoint);
    await expectSignedWorkspaceVersion(endpoint, paired);

    const pairingCiphertext = await readFile(path.join(stateRoot, 'user-data', 'companion-paired-devices.bin'));
    expect(pairingCiphertext.toString('utf8')).not.toContain(paired.secret);
    const publishCiphertext = await readFile(path.join(stateRoot, 'user-data', 'foliole-publish-cloudflare-token.bin'));
    expect(publishCiphertext.toString('utf8')).not.toContain(API_TOKEN);

    await closeDesktopApplication(desktopSession.electronApp);
    relaunched = await launchDesktopSession({
      env: { ...desktopSession.launchOptions.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    }) as DesktopSession;
    await expectExternalCapabilities(relaunched);
    const restored = await relaunched.firstWindow.evaluate(() => window.electronAPI?.invoke('load_foliole_publish_settings'));
    expect(restored).toMatchObject({ credentials_valid: true, has_credentials: true });
    const restoredOverview = await relaunched.firstWindow.evaluate(
      () => window.electronAPI?.invoke('load_companion_pairing_overview')
    ) as { server_status: { advertised_urls: string[] } };
    const restoredEndpoint = restoredOverview.server_status.advertised_urls.find((url) => url.includes('127.0.0.1'));
    expect(restoredEndpoint).toBeTruthy();
    await expectSignedWorkspaceVersion(restoredEndpoint!, paired);
  } finally {
    await relaunched?.close();
  }
});
