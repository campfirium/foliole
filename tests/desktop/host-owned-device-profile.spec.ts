import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

const EXPECTED_DEVICE_PROFILE = os.hostname().trim().replace(/\.local$/iu, '') || 'Desktop client';

function readProfile(databasePath: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    // The host profile lives in host_name; device_id is only a legacy identity.
    const raw = database.prepare("SELECT value FROM settings WHERE key = 'host_name'").get()?.value;
    const uuid = database.prepare("SELECT value FROM settings WHERE key = 'standalone_device_uuid'").get()?.value;
    return { host: typeof raw === 'string' ? JSON.parse(raw) : null,
      uuid: typeof uuid === 'string' ? JSON.parse(uuid) : null };
  } finally {
    database.close();
  }
}

test('desktop startup owns the current host profile across a legacy identity restart', async ({ browserName }) => {
  void browserName;
  const artifactRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/desktop-device-profile-'));
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: artifactRoot };
  let session = await launchDesktopSession({ env });

  try {
    let window = session.firstWindow;
    const libraryHome = await session.electronApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME);
    if (!libraryHome) throw new Error('Desktop host did not expose its isolated library home.');
    const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
    const initialProfile = readProfile(databasePath);
    expect(initialProfile.host).toBe(EXPECTED_DEVICE_PROFILE);
    expect(initialProfile.uuid).toMatch(/^[0-9a-f-]{36}$/);
    await session.electronApp.evaluate(async (_electron, folder) => {
      const fs = process.getBuiltinModule('fs')!;
      const pathApi = process.getBuiltinModule('path')!;
      const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
      const sources = require(pathApi.join(process.cwd(), 'dist/electron/database/desktopSources.js'));
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(pathApi.join(folder, 'article.md'), 'Persistent relay source');
      await connection.runWithDatabaseConnectionOwner(() => sources.upsertDesktopSource({
        configRef: 'native-relay', rootPath: folder, sourceType: 'readwise', updatedAt: new Date().toISOString()
      }));
    }, path.join(artifactRoot, 'relay'));
    await window.evaluate(async () => globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([{
      content: '# Host-owned device profile', id: 'host-owned-device-profile',
      kind: 'topic', title: 'Host-owned device profile'
    }]));
    await session.close();

    // Simulate a library written before host profiles: only a legacy device identity.
    const database = new DatabaseSync(databasePath);
    database.prepare("DELETE FROM settings WHERE key = 'host_name'").run();
    database.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, 'legacy')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify('desktop-device-legacy'));
    database.close();

    session = await launchDesktopSession({ env });
    window = session.firstWindow;
    expect(readProfile(databasePath)).toEqual(initialProfile);
    const relay = await session.electronApp.evaluate(async () => {
      const pathApi = process.getBuiltinModule('path')!;
      const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
      const sources = require(pathApi.join(process.cwd(), 'dist/electron/database/desktopSources.js'));
      return connection.runWithDatabaseConnectionOwner(() => {
        const local = sources.loadCurrentHostDesktopSources('readwise');
        const file = sources.resolveDesktopSourceAddress('readwise:native-relay', 'article.md');
        return { count: local.length, text: file ? process.getBuiltinModule('fs')!.readFileSync(file, 'utf8') : null };
      });
    });
    expect(relay).toEqual({ count: 1, text: 'Persistent relay source' });
    await expect.poll(() => window.evaluate(() =>
      globalThis.window?.__folioleWorkspaceDebug?.getNode?.('host-owned-device-profile')
    )).toMatchObject({ title: 'Host-owned device profile' });
  } finally {
    await session.close().catch(() => undefined);
    fs.rmSync(artifactRoot, { force: true, recursive: true });
  }
});

async function readMemberState(session: Awaited<ReturnType<typeof launchDesktopSession>>) {
  return session.electronApp.evaluate(async () => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), 'dist/electron', `${name}.js`));
    await new Promise<void>((resolve) => setImmediate(resolve));
    return load('database/connection').runWithDatabaseConnectionOwner(() => {
      const group = load('database/syncGroupStore').loadDesktopSyncGroup();
      const source = load('database/connection').openDatabaseConnection().driver.queryOne(
        "SELECT type_settings_json FROM desktop_sources WHERE config_ref = 'copy-owner'"
      );
      return { group, source: JSON.parse(source.type_settings_json),
        executableSources: load('database/desktopSources').loadCurrentHostDesktopSources('readwise').length };
    });
  });
}

async function seedCopiedLibrary(session: Awaited<ReturnType<typeof launchDesktopSession>>, root: string) {
  await session.electronApp.evaluate(async (_electron, folder) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), 'dist/electron', `${name}.js`));
    await load('database/connection').runWithDatabaseConnectionOwner(async () => {
      const { identity } = await load('deviceAnchorStore').loadDesktopDeviceIdentity({
        groupId: 'native-copy-group', libraryPath: load('database/connection').openDatabaseConnection().dbPath
      });
      load('database/syncGroupStore').createDesktopSyncGroup({
        device: identity, deviceName: 'Original', platform: process.platform
      });
      process.getBuiltinModule('fs')!.mkdirSync(folder, { recursive: true });
      load('database/desktopSources').upsertDesktopSource({
        configRef: 'copy-owner', rootPath: folder, sourceType: 'readwise', updatedAt: new Date().toISOString()
      });
    });
  }, path.join(root, 'source'));
  await session.firstWindow.evaluate(async () => globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([{
    content: '# Preserved copied content', id: 'copied-profile-content', kind: 'topic', title: 'Preserved copied content'
  }]));
}

test('a copied library opens as a distinct member without taking its original sources', async ({ browserName }, info) => {
  void browserName;
  test.info().annotations.push({ type: 'calibrated-ms', description: String(120_000) });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/copied-device-profile-'));
  const originalRoot = path.join(root, 'original');
  const copiedRoot = path.join(root, 'copied');
  const open = (stateRoot: string) => launchDesktopSession({
    env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
  });
  let session = await open(originalRoot);
  try {
    await seedCopiedLibrary(session, root);
    const original = await readMemberState(session);
    expect(original.executableSources).toBe(1);
    await session.close();
    fs.mkdirSync(copiedRoot, { recursive: true });
    fs.cpSync(path.join(originalRoot, 'library'), path.join(copiedRoot, 'library'), { recursive: true });

    session = await open(copiedRoot);
    await expect(session.firstWindow.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ })).toBeVisible();
    const copied = await readMemberState(session);
    expect(copied.group.group_id).toBe(original.group.group_id);
    expect(copied.group.local_device_identity_key).not.toBe(original.group.local_device_identity_key);
    expect(copied.group.devices).toEqual(expect.arrayContaining(original.group.devices));
    expect(copied.source.ownerDeviceIdentityKey).toBe(original.group.local_device_identity_key);
    expect(copied.executableSources).toBe(0);
    await expect.poll(() => session.firstWindow.evaluate(() =>
      globalThis.window?.__folioleWorkspaceDebug?.getNode?.('copied-profile-content')
    )).toMatchObject({ content: '# Preserved copied content' });
    await info.attach('copied-library-workspace', {
      body: await session.firstWindow.screenshot(), contentType: 'image/png'
    });
    await session.close();

    session = await open(originalRoot);
    const reopened = await readMemberState(session);
    expect(reopened.group.local_device_identity_key).toBe(original.group.local_device_identity_key);
    expect(reopened.source).toEqual(original.source);
    expect(reopened.executableSources).toBe(1);
    await info.attach('copied-library-identities', {
      body: JSON.stringify({ original, copied, reopened }, null, 2), contentType: 'application/json'
    });
  } finally {
    await session.close().catch(() => undefined);
    fs.rmSync(root, { force: true, recursive: true });
  }
});
