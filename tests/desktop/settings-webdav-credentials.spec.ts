import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';
import { replaceRejectedMacCredential } from './harness/webDavMacAuthentication';

async function openWebDavSettings(page: Page, createGroup = false) {
  await expectWorkspaceShell(page);
  const settings = await openSettingsDialog(page);
  if (createGroup) {
    await settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ }).click();
    await settings.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ }).click();
    await expect(settings.getByRole('list', { name: /^(Devices|设备)$/ })).toBeVisible();
  }
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
  return settings;
}

async function readSavedCiphertext(app: ElectronApplication, stateRoot: string) {
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  const relative = path.relative(stateRoot, userData);
  expect(relative.startsWith('..') || path.isAbsolute(relative)).toBe(false);
  const directory = path.join(userData, 'config', 'webdav-credentials');
  const files = await readdir(directory);
  expect(files).toHaveLength(1);
  const file = path.join(directory, files[0]!);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  return readFile(file);
}

async function saveAndRejectReplacement(page: Page, url: string, password: string, readCiphertext: () => Promise<Buffer>) {
  const settings = await openWebDavSettings(page, true);
  const folder = settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ });
  const username = settings.getByRole('textbox', { name: /^(Username|用户名)$/ });
  const secret = settings.getByLabel(/^(App password|应用密码)$/);
  const save = settings.getByRole('button', { name: /^(Test and save credentials|测试并保存凭据)$/ });

  await folder.fill(url);
  await username.fill('foliole-test-mac');
  await secret.fill(password);
  await save.click();
  await expect(settings.getByText(/WebDAV credentials saved securely on this Mac|WebDAV 凭据已安全保存在此 Mac/)).toBeVisible();
  await expect(secret).toHaveValue('');
  await expect(settings.getByText(/^(Service not configured|服务未配置)$/)).toBeVisible();
  const saved = await readCiphertext();
  expect(saved.includes(password)).toBe(false);
  expect(saved.includes('foliole-test-mac')).toBe(false);

  await secret.fill('wrong-password');
  await save.click();
  await expect(settings.getByText(/Could not verify or save WebDAV credentials|无法验证或保存 WebDAV 凭据/)).toBeVisible();
  await expect(secret).toHaveValue('');
  expect((await readCiphertext()).equals(saved)).toBe(true);
}

async function expectRestoredCredentials(stateRoot: string, url: string, testInfo: TestInfo) {
  const reopened = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const restored = await openWebDavSettings(reopened.firstWindow);
    await expect(restored.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ })).toHaveValue(url);
    await expect(restored.getByText(/Credentials saved on this Mac for|已在此 Mac 保存/)).toBeVisible();
    await expect(restored.getByLabel(/^(App password|应用密码)$/)).toHaveValue('');
    await testInfo.attach('webdav-credential-result', { body: await restored.screenshot(), contentType: 'image/png' });
  } finally {
    await reopened.close();
  }
}

async function seedAuthenticatedPhone(app: ElectronApplication, directory: string) {
  return app.evaluate(async (_electron, directoryUrl) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const crypto = process.getBuiltinModule('crypto')!;
    const { runWithDatabaseConnectionOwner, openDatabaseConnection } =
      require('./dist/electron/database/connection.js');
    const { loadDesktopSyncGroup, registerSyncGroupDevice } = require('./dist/electron/database/syncGroupStore.js');
    const { saveJsonSetting } = require('./dist/electron/database/settingsStore.js');
    const { createSyncGroupDeviceIdentity } = require('./dist/lib/platform/syncGroupUnifiedContract.js');
    const { desktopSyncChangeSessions } = require('./dist/electron/sync/desktopSyncChangeSessions.js');
    return runWithDatabaseConnectionOwner(() => {
      const group = loadDesktopSyncGroup();
      const device = createSyncGroupDeviceIdentity({ device_anchor: crypto.randomUUID(), group_id: group.group_id,
        library_path: '/test/phone', path_flavor: 'posix' });
      registerSyncGroupDevice({ device, deviceName: 'Test Android', platform: 'android' });
      openDatabaseConnection().sqlite.prepare(`INSERT INTO node_version_device_revisions
        (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
        VALUES (?, ?, 'phone-epoch', 1, 'pack', 'now')`).run(group.group_id, device.identity_key);
      const key = `webdav_relay_directory:${group.group_id}:${group.local_device_identity_key}`;
      const binding = { id: crypto.randomUUID(), group_id: group.group_id, desktop_device_id: group.local_device_identity_key,
        phone_device_id: device.identity_key, directory_url: directoryUrl, delivered: true, credential_version: 1 };
      saveJsonSetting(key, directoryUrl);
      saveJsonSetting(`${key}:binding`, binding);
      desktopSyncChangeSessions().open(device.identity_key);
      require('./dist/electron/sync/desktopSyncGroupOverviewNotifier.js').notifyDesktopSyncGroupOverviewChanged();
      return binding;
    });
  }, directory);
}

async function confirmTestPhone(app: ElectronApplication, groupId: string, phoneId: string) {
  return app.evaluate((_electron, { groupId, phoneId }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const crypto = process.getBuiltinModule('crypto')!;
    const { runWithDatabaseConnectionOwner } = require('./dist/electron/database/connection.js');
    const { webDavCredentialTranscript } = require('./dist/lib/platform/webDavCredentialDeliveryContract.js');
    const { createWebDavCredentialKey, webDavCredentialProof } = require('./dist/electron/sync/desktopWebDavCredentialCrypto.js');
    const { desktopWebDavCredentialDeliveryForPeer, handleDesktopWebDavCredentialReply } =
      require('./dist/electron/sync/desktopWebDavCredentialDelivery.js');
    return runWithDatabaseConnectionOwner(() => {
      const { offer } = desktopWebDavCredentialDeliveryForPeer(groupId, phoneId);
      const phone = createWebDavCredentialKey();
      const { privateKey: identityPrivateKey, publicKey: identity } = createWebDavCredentialKey();
      const transcriptBytes = Buffer.from(webDavCredentialTranscript(offer, phone.publicKey, identity));
      const transcript = crypto.createHash('sha256').update(transcriptBytes).digest();
      const publicKey = crypto.createPublicKey({ key: Buffer.from(offer.desktop_key, 'base64url'), format: 'der', type: 'spki' });
      const secret = crypto.diffieHellman({ privateKey: phone.privateKey, publicKey });
      const key = (purpose: string) => Buffer.from(crypto.hkdfSync('sha256', secret, transcript, purpose, 32));
      const confirmation = webDavCredentialProof(key('WebDAV credential confirmation'), 'confirmed');
      const reply = { id: offer.id, phone_key: phone.publicKey, phone_identity_key: identity };
      const phoneIdentityProof = crypto.sign('sha256', transcriptBytes, identityPrivateKey).toString('base64url');
      handleDesktopWebDavCredentialReply(groupId, phoneId, { ...reply, phone_identity_proof: phoneIdentityProof, confirmation });
      return { offer, reply: { ...reply, receipt: webDavCredentialProof(key('WebDAV credential receipt'), 'installed') },
        phoneIdentity: identityPrivateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url') };
    });
  }, { groupId, phoneId });
}

async function deliverTestReceipt(app: ElectronApplication, receipt: Awaited<ReturnType<typeof confirmTestPhone>>) {
  return app.evaluate((_electron, { offer, reply }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { runWithDatabaseConnectionOwner } = require('./dist/electron/database/connection.js');
    const { handleDesktopWebDavCredentialReply } = require('./dist/electron/sync/desktopWebDavCredentialDelivery.js');
    const { loadDesktopBoundWebDavRelay } = require('./dist/electron/sync/desktopWebDavRelaySettings.js');
    return runWithDatabaseConnectionOwner(() => {
      handleDesktopWebDavCredentialReply(offer.binding.group_id, offer.binding.phone_device_id, reply);
      return loadDesktopBoundWebDavRelay();
    });
  }, { offer: receipt.offer, reply: receipt.reply });
}

async function submitPhoneCredentials(settings: ReturnType<Page['getByRole']>, username: string, password: string,
  automatic: boolean) {
  await settings.getByRole('textbox', { name: /^(Phone WebDAV username|手机 WebDAV 用户名)$/ }).fill(username);
  const secret = settings.getByLabel(/^(Phone app password|手机应用密码)$/);
  await secret.fill(password);
  const button = automatic ? /^(Save new credentials|保存新凭据)$/ : /^(Fingerprints match|指纹一致)$/;
  await settings.getByRole('button', { name: button }).click();
  const waiting = automatic ? /New credentials saved|已保存新凭据/
    : /Waiting for both devices|正在等待双端确认/;
  await expect(settings.getByText(waiting)).toBeVisible();
}

const replaceButton = /^(Replace phone credentials|更换手机凭据)$/;
const queuedText = /New credentials saved|已保存新凭据/;

async function assertQueuedCredentialCiphertext(app: ElectronApplication, password: string, queued: boolean) {
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  const directory = path.join(userData, 'config', 'webdav-credentials');
  const names = await readdir(directory);
  expect(names).toHaveLength(queued ? 3 : 2);
  for (const name of names) {
    const file = path.join(directory, name);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const ciphertext = await readFile(file);
    expect(ciphertext.includes(password)).toBe(false);
    expect(ciphertext.includes('foliole-test-phone-new')).toBe(false);
  }
}

async function replaceAfterReopen(stateRoot: string, initial: Awaited<ReturnType<typeof confirmTestPhone>>, password: string,
  testInfo: TestInfo, newMacPassword: string) {
  const offline = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const settings = await openWebDavSettings(offline.firstWindow);
    await settings.getByRole('button', { name: replaceButton }).click();
    await expect(settings.getByRole('button', { name: /^(Fingerprints match|指纹一致)$/ })).toHaveCount(0);
    await submitPhoneCredentials(settings, 'foliole-test-phone-new', password, true);
    await assertQueuedCredentialCiphertext(offline.electronApp, password, true);
    await testInfo.attach('webdav-offline-rotation', { body: await settings.screenshot(), contentType: 'image/png' });
  } finally { await offline.close(); }

  const reopened = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const settings = await openWebDavSettings(reopened.firstWindow);
    await expect(settings.getByText(queuedText)).toBeVisible();
    const result = await reopened.electronApp.evaluate(async (_electron, { offer, phoneIdentity }) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const { installQueuedRotationWithTestPhone } = require('./dist/electron/sync/webDavQueuedRotation.testSupport.js');
      return installQueuedRotationWithTestPhone(offer.binding.group_id, offer.binding.phone_device_id,
        phoneIdentity, offer.desktop_identity.public_key);
    }, { offer: initial.offer, phoneIdentity: initial.phoneIdentity });
    expect(result).toMatchObject({ late: 409, installed: 200, resumedWithNewChallenge: true });
    expect(result.previous).toMatchObject({ id: initial.offer.binding.id, credential_version: initial.offer.version });
    expect(result.stillActive).toEqual(result.previous);
    expect(result.active).toMatchObject({ id: initial.offer.binding.id, credential_version: result.resumedVersion });
    expect(result.resumedVersion).toBeGreaterThan(initial.offer.version);
    await expect(settings.getByRole('button', { name: replaceButton })).toBeVisible();
    await assertQueuedCredentialCiphertext(reopened.electronApp, password, false);
    await replaceRejectedMacCredential(reopened.electronApp, settings, newMacPassword);
    await testInfo.attach('webdav-mac-credentials-replaced', { body: await settings.screenshot(), contentType: 'image/png' });
  } finally { await reopened.close(); }
}

test('keeps encrypted WebDAV credentials across relaunch and a failed replacement', async ({ browserName }, testInfo) => {
  void browserName;
  const url = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_URL;
  const password = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_PASSWORD;
  // SKIP: requires a macOS Internal renderer and a dedicated HTTPS DAV sandbox | 2026-11-11 | revive: authenticated sandbox is provisioned by the native lane
  test.skip(process.platform !== 'darwin' || !url || !password, 'Requires an isolated authenticated DAV sandbox.');
  if (!url || !password) throw new Error('Test DAV sandbox is unavailable.');

  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-webdav-credentials-'));
  try {
    const first = await createT178ApiAcceptanceSession(stateRoot);
    try {
      await saveAndRejectReplacement(first.firstWindow, url, password,
        () => readSavedCiphertext(first.electronApp, stateRoot));
    } finally {
      await first.close();
    }
    await expectRestoredCredentials(stateRoot, url, testInfo);
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test('queues phone credentials offline and resumes authenticated delivery after Mac restart', async ({ browserName }, testInfo) => {
  void browserName;
  const url = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_URL;
  const password = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_PASSWORD;
  const phonePassword = process.env.FOLIOLE_TEST_PHONE_WEBDAV_PASSWORD;
  const replacementPassword = process.env.FOLIOLE_TEST_PHONE_REPLACEMENT_WEBDAV_PASSWORD;
  const newMacPassword = process.env.FOLIOLE_TEST_MAC_REPLACEMENT_WEBDAV_PASSWORD;
  // SKIP: requires an isolated HTTPS DAV sandbox with independent Mac and phone accounts | 2026-11-11 | revive: the native lane provisions both accounts
  test.skip(process.platform !== 'darwin' || !url || !password || !phonePassword || !replacementPassword || !newMacPassword);
  if (!url || !password || !phonePassword || !replacementPassword || !newMacPassword) throw new Error('Test DAV accounts are unavailable.');
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-webdav-replace-phone-'));
  try {
    const session = await createT178ApiAcceptanceSession(stateRoot);
    let initial: Awaited<ReturnType<typeof confirmTestPhone>>;
    try {
      const { electronApp, firstWindow } = session;
      await saveAndRejectReplacement(firstWindow, url, password, () => readSavedCiphertext(electronApp, stateRoot));
      const original = await seedAuthenticatedPhone(electronApp, url);
      const settings = await openSettingsDialog(firstWindow);
      await settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ }).click();
      await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
      const replace = settings.getByRole('button', { name: /^(Replace phone credentials|更换手机凭据)$/ });
      await replace.click();
      initial = await confirmTestPhone(electronApp, original.group_id, original.phone_device_id);
      expect(initial.offer.binding.id).toBe(original.id);
      expect(initial.offer.version).toBeGreaterThan(original.credential_version);
      await submitPhoneCredentials(settings, 'foliole-test-phone', phonePassword, false);
      await testInfo.attach('webdav-replacement', { body: await settings.screenshot(), contentType: 'image/png' });
      expect(await deliverTestReceipt(electronApp, initial)).toMatchObject({
        id: original.id, credential_version: initial.offer.version
      });
      await expect(replace).toBeVisible();
    } finally { await session.close(); }
    await replaceAfterReopen(stateRoot, initial, replacementPassword, testInfo, newMacPassword);
  } finally { await rm(stateRoot, { force: true, recursive: true }); }
});
