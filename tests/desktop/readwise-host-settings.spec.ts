import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const GROUP_ID = 't204-readwise-owner-group';
const LOCAL_ID = 't204-local';
const REMOTE_ID = 't204-remote';
const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t204');

async function seedIsolatedLibrary(app: ElectronApplication, sourceRoot: string) {
  await app.evaluate(async (_electron, fixture) => {
    const crypto = process.getBuiltinModule('crypto')!;
    const fs = process.getBuiltinModule('fs')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const imports = require(pathApi.join(process.cwd(), 'dist/electron/import/importManagerSettings.js'));
    const defaults = require(pathApi.join(process.cwd(), 'dist/lib/core/import/importManagerSettings.js'));
    fs.mkdirSync(fixture.root, { recursive: true });
    await connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const hostName = host.loadReadwiseHostAssignment().current_host_name;
      driver.execute(`INSERT INTO sync_groups
        (group_id,display_name,workgroup_key,created_at,updated_at)
        VALUES (?,?,?,?,?)`, [fixture.groupId, 'Workgroup', crypto.randomBytes(32).toString('base64url'), 'now', 'now']);
      driver.execute(`INSERT INTO sync_group_local_state
        (singleton_id,group_id,local_device_identity_key,state,updated_at)
        VALUES (1,?,?,?,?)`, [fixture.groupId, fixture.localId, 'active', 'now']);
      for (const [id, name, platform] of [[fixture.localId, hostName, process.platform],
        [fixture.remoteId, 'Offline Desktop', 'Windows 11']]) {
        driver.execute(`INSERT INTO sync_group_devices
          (group_id,device_identity_key,device_anchor,canonical_library_path,device_name,
           platform,state,joined_at,left_at,last_seen_at,updated_at)
          VALUES (?,?,?,?,?,?,'active','now',NULL,'now','now')`,
        [fixture.groupId, id, `${id}-anchor`, `/library/${id}`, name, platform]);
      }
      const current = imports.loadImportManagerSettings();
      const sources = defaults.applyReadwiseRootPath(current.readwiseSources, fixture.root);
      fs.mkdirSync(sources[0].primaryPath, { recursive: true });
      fs.mkdirSync(sources[0].highlightPath, { recursive: true });
      imports.saveImportManagerSettings({ ...current, readwiseRootPath: fixture.root,
        readwiseSources: sources.map((source: { kind?: string; keepState: string }, index: number) =>
          index === 0 ? { ...source, keepState: 'draft' } : source) });
    });
  }, { groupId: GROUP_ID, localId: LOCAL_ID, remoteId: REMOTE_ID, root: sourceRoot });
}

async function readOwnerFacts(app: ElectronApplication) {
  return app.evaluate((_electron, groupId) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const assignment = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const guard = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseOwnerGuard.js'));
    return connection.runWithDatabaseConnectionOwner(() => ({
      assignment: assignment.loadReadwiseHostAssignment(),
      canRun: assignment.canCurrentHostRunReadwise('relay'),
      guard: guard.loadReadwiseOwnerGuard(groupId)
    }));
  }, GROUP_ID);
}

async function updateGroup(app: ElectronApplication, action: 'leave-remote' | 'rollback-owner') {
  await app.evaluate((_electron, fixture) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/database/settingsStore.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      if (fixture.action === 'leave-remote') {
        connection.openDatabaseConnection().driver.execute(
          "UPDATE sync_group_devices SET state='left' WHERE device_identity_key=?", [fixture.remoteId]
        );
      } else settings.saveJsonSetting('readwise_active_host', null);
    });
  }, { action, remoteId: REMOTE_ID });
}

test('keeps an unassigned library paused, survives offline retry, and rejects owner rollback', async ({
  desktopApp, desktopSession, desktopWindow
}) => {
  test.setTimeout(180_000);
  await expectWorkspaceShell(desktopWindow);
  const sourceRoot = path.join(desktopSession.target.runtimeStateRoot, 'Readwise');
  await seedIsolatedLibrary(desktopApp, sourceRoot);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  let dialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  const host = dialog.getByRole('region', { name: /^(Current active host|当前生效主机)$/ });
  await expect(host.getByText(/^(No device selected|尚未指定设备)$/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Readwise root folder|Readwise 根文件夹)$/ })).toBeVisible();
  await expect(dialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toHaveCount(0);
  await host.getByRole('button', { name: /^(Use this device|由此设备负责)$/ }).click();
  await expect(host.getByText(/Could not change|未能切换/)).toBeVisible();
  expect((await readOwnerFacts(desktopApp)).guard).toBeNull();

  await updateGroup(desktopApp, 'leave-remote');
  await desktopWindow.reload();
  dialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  await dialog.getByRole('button', { name: /^(Use this device|由此设备负责)$/ }).click();
  await expect(dialog.getByText(/^(Readwise Reader Import|Readwise Reader 导入)$/)).toBeVisible();
  const active = await readOwnerFacts(desktopApp);
  expect(active.assignment.is_active).toBe(true);
  expect(active.guard).toMatchObject({ epoch: 1, ownerId: LOCAL_ID, state: 'active' });
  expect(active.canRun).toBe(false);

  await updateGroup(desktopApp, 'rollback-owner');
  await desktopWindow.reload();
  dialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  await expect(dialog.getByRole('button', { name: /^(Use this device|由此设备负责)$/ })).toBeDisabled();
  expect((await readOwnerFacts(desktopApp)).assignment.activation_blocked_reason).toBe('guard-history');
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await dialog.screenshot({ path: path.join(ARTIFACT_DIR, 'readwise-owner-rollback.png') });
});
