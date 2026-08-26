import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

const CHANNEL = 'foliole:sync-group-join-prepare';
const GROUP_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

interface AcceptanceEnvelope {
  ciphertext: string;
  iv: string;
  salt: string;
  server_public_key: string;
}

async function openAcceptanceWindow(electronApp: ElectronApplication) {
  const requester = await electronApp.evaluate(async ({ app, BrowserWindow, ipcMain }, input) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    const cryptoApi = process.getBuiltinModule('node:crypto');
    if (!pathApi || !moduleApi || !cryptoApi) throw new Error('Node built-ins unavailable.');
    const loadModule = moduleApi.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const { DesktopSyncGroupJoinPrepareProvider } = loadModule(pathApi.join(
      app.getAppPath(), 'sync', 'syncGroupJoinPrepareProvider.js'
    ));
    const provider = new DesktopSyncGroupJoinPrepareProvider(input.groupInfo);
    ipcMain.removeHandler(input.channel);
    ipcMain.handle(input.channel, async (_event, message) => {
      const payload = message?.payload ?? {};
      if (message?.operation === 'receive_request') return provider.receive(payload.request);
      if (message?.operation === 'load_requests') return provider.pending();
      if (message?.operation === 'accept_request') return provider.accept(payload.request_id);
      if (message?.operation === 'collect_acceptance') return provider.collect(payload.request_id);
      if (message?.operation === 'reject_request') return provider.reject(payload.request_id);
      throw new Error('unsupported_join_prepare_operation');
    });
    const window = new BrowserWindow({ height: 520, show: false, width: 760, webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: pathApi.join(process.cwd(), 'electron', 'preloadSyncGroupJoinPrepare.cjs'),
      sandbox: true
    } });
    await window.loadFile(pathApi.join(
      process.cwd(), 'tests', 'desktop', 'fixtures', 'sync-group-join-prepare.html'
    ));
    const keyPair = await cryptoApi.webcrypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    );
    return {
      privateKey: await cryptoApi.webcrypto.subtle.exportKey('jwk', keyPair.privateKey),
      publicKey: Buffer.from(await cryptoApi.webcrypto.subtle.exportKey(
        'raw', keyPair.publicKey
      )).toString('base64url')
    };
  }, { channel: CHANNEL, groupInfo: {
    display_name: 'T152 Acceptance Group', group_id: 'group-a', workgroup_key: GROUP_KEY
  } });
  const page = electronApp.windows().find((candidate) =>
    candidate.url().replaceAll('\\', '/').endsWith('/tests/desktop/fixtures/sync-group-join-prepare.html')
  );
  if (!page) throw new Error('Sync Group join prepare acceptance window did not open.');
  await page.waitForLoadState('domcontentloaded');
  return { page, requester };
}

async function seedRequest(page: Page, publicKey: string) {
  return page.evaluate(async (requesterPublicKey) => {
    const bridge = (globalThis as unknown as { folioleSyncGroupJoinPrepare: {
      acceptRequest(id: string): Promise<unknown>;
      collectAcceptance(id: string): Promise<unknown>;
      loadRequests(): Promise<Array<{ device_name: string; request_id: string }>>;
      receiveRequest(value: unknown): Promise<{ request_id: string }>;
    } }).folioleSyncGroupJoinPrepare;
    const request = await bridge.receiveRequest({ contract_version: 1, device: {
      canonical_library_path: '/Users/device/Foliole/Data/foliole.db',
      device_anchor: 'a1111111-1111-4111-8111-111111111111',
      device_name: 'Desktop requester', path_flavor: 'posix', platform: 'desktop'
    }, ephemeral_public_key: requesterPublicKey, group_id: 'group-a' });
    const state = globalThis as unknown as Record<string, unknown>;
    state.__t152RequestId = request.request_id;
    const pending = await bridge.loadRequests();
    document.querySelector('main')!.innerHTML = `<h1>Join request</h1>
      <p>${pending[0]?.device_name} wants to join this Sync Group.</p>
      <button type="button">Accept</button><p id="status">Pending</p>`;
    document.querySelector('button')!.addEventListener('click', async () => {
      await bridge.acceptRequest(request.request_id);
      document.querySelector('#status')!.textContent = 'Accepted';
    });
    return { before: await bridge.collectAcceptance(request.request_id), requestId: request.request_id };
  }, publicKey);
}

async function collectAcceptance(page: Page) {
  return page.evaluate(async () => {
    const state = globalThis as unknown as Record<string, unknown>;
    type Acceptance = { encrypted_group_info: AcceptanceEnvelope };
    const bridge = (globalThis as unknown as { folioleSyncGroupJoinPrepare: {
      collectAcceptance(id: string): Promise<Acceptance | null>;
    } }).folioleSyncGroupJoinPrepare;
    const requestId = state.__t152RequestId as string;
    const acceptance = await bridge.collectAcceptance(requestId);
    if (!acceptance) throw new Error('Accepted request did not expose its encrypted envelope.');
    return { after: await bridge.collectAcceptance(requestId),
      envelope: acceptance.encrypted_group_info };
  });
}

async function decryptAcceptance(privateKey: JsonWebKey, envelope: AcceptanceEnvelope) {
  const decode = (value: string) => Buffer.from(value, 'base64url');
  const clientKey = await webcrypto.subtle.importKey(
    'jwk', privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
  const serverKey = await webcrypto.subtle.importKey('raw', decode(envelope.server_public_key),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await webcrypto.subtle.deriveBits(
    { name: 'ECDH', public: serverKey }, clientKey, 256
  );
  const hkdf = await webcrypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ hash: 'SHA-256',
    info: new TextEncoder().encode('Foliole companion pairing v1'), name: 'HKDF',
    salt: decode(envelope.salt) }, hkdf, { length: 256, name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv) },
    key, decode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

test('accepts one concrete Device request through the inactive sandbox bridge', async ({ browserName }) => {
  void browserName;
  const { launchDesktopSession } = await import('../../scripts/desktop/playwright-desktop-harness.mjs');
  const session = await launchDesktopSession();
  const evidenceRoot = process.env.FOLIOLE_SYNC_GROUP_JOIN_PREPARE_EVIDENCE_ROOT?.trim()
    || path.resolve('.tmp/artifacts/desktop-acceptance', `sync-group-join-prepare-${process.platform}`);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  try {
    const { page, requester } = await openAcceptanceWindow(session.electronApp);
    const seeded = await seedRequest(page, requester.publicKey);
    expect(seeded.before).toBeNull();
    await expect(page.getByText('Desktop requester wants to join this Sync Group.')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceRoot, 'sync-group-join-prepare.png') });
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('Accepted')).toBeVisible();
    const result = await collectAcceptance(page);
    expect(await decryptAcceptance(requester.privateKey, result.envelope)).toEqual({
      display_name: 'T152 Acceptance Group',
      group_id: 'group-a', workgroup_key: GROUP_KEY });
    expect(result.after).toBeNull();
    fs.writeFileSync(path.join(evidenceRoot, 'sync-group-join-prepare-receipt.json'),
      `${JSON.stringify({ host: process.platform, requestId: seeded.requestId,
        resultStatus: 'success', sandbox: true }, null, 2)}\n`);
  } finally {
    await session.close().catch(() => undefined);
  }
});
