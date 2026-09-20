import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const GROUP_ID = 't204-two-runtime-group';
const OLD_ANCHOR = '11111111-1111-4111-8111-111111111111';
const NEW_ANCHOR = '22222222-2222-4222-8222-222222222222';
const OLD_ID = createSyncGroupDeviceIdentity({ device_anchor: OLD_ANCHOR,
  group_id: GROUP_ID, library_path: '/library/old', path_flavor: 'posix' }).identity_key;
const NEW_ID = createSyncGroupDeviceIdentity({ device_anchor: NEW_ANCHOR,
  group_id: GROUP_ID, library_path: '/library/new', path_flavor: 'posix' }).identity_key;
const RECEIPT_PATH = path.resolve('.tmp/artifacts/desktop-acceptance/t204/two-runtime-handoff.json');

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No free port.');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function seed(app: ElectronApplication, input: {
  groupKey: string; isOld: boolean; sourceRoot: string;
}) {
  await app.evaluate(async (_electron, fixture) => {
    const fs = process.getBuiltinModule('fs')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const imports = require(pathApi.join(process.cwd(), 'dist/electron/import/importManagerSettings.js'));
    const defaults = require(pathApi.join(process.cwd(), 'dist/lib/core/import/importManagerSettings.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      driver.execute(`INSERT INTO sync_groups
        (group_id,display_name,workgroup_key,created_at,updated_at)
        VALUES (?,?,?,?,?)`, [fixture.groupId, 'T204 Group', fixture.groupKey, 'now', 'now']);
      driver.execute(`INSERT INTO sync_group_local_state
        (singleton_id,group_id,local_device_identity_key,state,updated_at)
        VALUES (1,?,?,?,?)`, [fixture.groupId, fixture.isOld ? fixture.oldId : fixture.newId, 'active', 'now']);
      for (const [id, name, anchor, libraryPath] of [
        [fixture.oldId, 'Old Desktop', fixture.oldAnchor, '/library/old'],
        [fixture.newId, 'New Desktop', fixture.newAnchor, '/library/new']
      ]) {
        driver.execute(`INSERT INTO sync_group_devices
          (group_id,device_identity_key,device_anchor,canonical_library_path,device_name,
           platform,state,joined_at,left_at,last_seen_at,updated_at)
          VALUES (?,?,?,?,?,'macOS','active','now',NULL,'now','now')`,
        [fixture.groupId, id, anchor, libraryPath, name]);
      }
      const current = imports.loadImportManagerSettings();
      const sources = defaults.applyReadwiseRootPath(current.readwiseSources, fixture.sourceRoot);
      fs.mkdirSync(sources[0].primaryPath, { recursive: true });
      fs.mkdirSync(sources[0].highlightPath, { recursive: true });
      imports.saveImportManagerSettings({ ...current, readwiseRootPath: fixture.sourceRoot,
        readwiseSources: sources.map((source: Record<string, unknown>, index: number) =>
          index === 0 ? { ...source, keepState: 'enabled' } : source) });
      settings.saveJsonSetting('readwise_active_host', { device_identity_key: fixture.oldId,
        epoch: 0, host_name: 'Old Desktop' });
    });
  }, { ...input, groupId: GROUP_ID, oldId: OLD_ID, newId: NEW_ID,
    oldAnchor: OLD_ANCHOR, newAnchor: NEW_ANCHOR });
}

async function facts(app: ElectronApplication) {
  return app.evaluate((_electron, groupId) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const assignment = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const guard = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseOwnerGuard.js'));
    const barrier = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseExecutionBarrier.js'));
    const endpoints = require(pathApi.join(process.cwd(), 'dist/electron/sync/desktopSyncGroupMemberStateSession.js'));
    return connection.runWithDatabaseConnectionOwner(() => ({
      assignment: assignment.loadReadwiseHostAssignment(),
      canRun: assignment.canCurrentHostRunReadwise('relay'),
      guard: guard.loadReadwiseOwnerGuard(groupId),
      peerIds: endpoints.loadDesktopSyncGroupMemberEndpoints(groupId)
        .map((peer: { peer_device_id: string }) => peer.peer_device_id),
      stopping: barrier.isReadwiseExecutionStopping(groupId)
    }));
  }, GROUP_ID);
}

async function startServer(session: DesktopSession) {
  await session.firstWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('enable_companion_sync'));
  await expect.poll(async () => {
    const result = await session.firstWindow.evaluate(async () =>
      globalThis.window?.electronAPI?.invoke('load_sync_group_overview'));
    return result?.server_status?.state;
  }).toBe('running');
}

async function holdOldRunner(app: ElectronApplication) {
  await app.evaluate(() => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const runner = require(pathApi.join(process.cwd(), 'dist/electron/import/keepImportRunnerOwner.js'));
    void runner.requestKeepImportRun({ ruleId: 't204-held-run', sourceType: 'readwise' },
      () => new Promise<void>((resolve) => { (globalThis as typeof globalThis & {
        __t204Release?: () => void
      }).__t204Release = resolve; }));
  });
}

async function handoffWithHeldRunner(old: DesktopSession, candidate: DesktopSession) {
  await holdOldRunner(old.electronApp);
  await candidate.firstWindow.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __t204Handoff?: Promise<unknown>; __t204HandoffError?: string
    };
    state.__t204Handoff = globalThis.window!.electronAPI!.invoke('activate_readwise_on_this_host')
      .catch((error) => { state.__t204HandoffError = String(error); throw error; });
    void state.__t204Handoff.catch(() => undefined);
  });
  await expect.poll(async () => {
    const error = await candidate.firstWindow.evaluate(() => (globalThis as typeof globalThis & {
      __t204HandoffError?: string
    }).__t204HandoffError);
    if (error) throw new Error(`handoff failed before stop: ${error}`);
    return (await facts(old.electronApp)).stopping;
  }).toBe(true);
  expect((await facts(old.electronApp)).guard).toBeNull();
  expect((await facts(candidate.electronApp)).assignment.active_device_identity_key).toBe(OLD_ID);
  await old.electronApp.evaluate(() => (globalThis as typeof globalThis & {
    __t204Release?: () => void
  }).__t204Release?.());
  await candidate.firstWindow.evaluate(() => (globalThis as typeof globalThis & {
    __t204Handoff?: Promise<unknown>
  }).__t204Handoff);
  expect((await facts(old.electronApp)).guard).toMatchObject({ state: 'relinquished', targetId: NEW_ID });
  expect((await facts(old.electronApp)).canRun).toBe(false);
  expect((await facts(candidate.electronApp)).guard).toMatchObject({ state: 'active', ownerId: NEW_ID });
  expect((await facts(candidate.electronApp)).canRun).toBe(true);
}

test('hands off between independent runtimes only after the old runner drains', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(180_000);
  const [oldPort, newPort] = await Promise.all([freePort(), freePort()]);
  const groupKey = randomBytes(32).toString('base64url');
  const oldEnv = { ...process.env, FOLIOLE_COMPANION_SYNC_PORT: String(oldPort),
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('old-state') };
  const newEnv = { ...process.env, FOLIOLE_COMPANION_SYNC_PORT: String(newPort),
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('new-state') };
  let old: DesktopSession | null = null;
  let candidate: DesktopSession | null = null;
  try {
    old = await launchDesktopSession({ env: oldEnv }) as DesktopSession;
    candidate = await launchDesktopSession({ env: newEnv }) as DesktopSession;
    await expectWorkspaceShell(old.firstWindow);
    await expectWorkspaceShell(candidate.firstWindow);
    await seed(old.electronApp, { groupKey, isOld: true,
      sourceRoot: path.join(old.target.runtimeStateRoot, 'readwise') });
    await seed(candidate.electronApp, { groupKey, isOld: false,
      sourceRoot: path.join(candidate.target.runtimeStateRoot, 'readwise') });
    expect((await facts(old.electronApp)).canRun).toBe(true);
    expect((await facts(candidate.electronApp)).canRun).toBe(false);
    await startServer(old);
    await startServer(candidate);
    await expect.poll(async () => (await facts(candidate!.electronApp)).peerIds.includes(OLD_ID),
      { timeout: 30_000 }).toBe(true);
    await handoffWithHeldRunner(old, candidate);
    await old.electronApp.evaluate((_electron, oldId) => {
      const pathApi = process.getBuiltinModule('path')!;
      const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
      const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
      connection.runWithDatabaseConnectionOwner(() => settings.saveJsonSetting('readwise_active_host', {
        device_identity_key: oldId, epoch: 0, host_name: 'Old Desktop'
      }));
    }, OLD_ID);
    await old.close();
    old = null;
    old = await launchDesktopSession({ env: oldEnv }) as DesktopSession;
    await expectWorkspaceShell(old.firstWindow);
    const restoredOld = await facts(old.electronApp);
    expect(restoredOld.assignment.active_device_identity_key).toBe(OLD_ID);
    expect(restoredOld.guard).toMatchObject({ state: 'relinquished', targetId: NEW_ID });
    expect(restoredOld.canRun).toBe(false);
    expect((await facts(candidate.electronApp)).canRun).toBe(true);
    await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
    await writeFile(RECEIPT_PATH, JSON.stringify({ restoredOld,
      newOwner: await facts(candidate.electronApp) }, null, 2));
    await testInfo.attach('t204-two-runtime-facts', { contentType: 'application/json', path: RECEIPT_PATH });
  } finally {
    await candidate?.close();
    await old?.close();
  }
});
