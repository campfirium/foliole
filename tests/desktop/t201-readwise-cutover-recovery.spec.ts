import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, getSettingsDialog, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t201');

async function seedRestoredLibrary(app: ElectronApplication, pendingCutover = false) {
  await app.evaluate((_electron, shouldCreateCutover) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const device = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseDeviceConnection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const reset = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseSourceCutoverReset.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const assignment = host.loadReadwiseHostAssignment();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000201.bin';
      secret.writeReadwiseApiSecret(secretRef, 't201-token');
      const deviceConnection = {
        secretRef, state: 'connected' as const, verifiedAt: '2026-09-16T00:00:00.000Z'
      };
      const source = shouldCreateCutover
        ? identity.createReadwiseRemoteSource('2026-09-16T00:00:00.000Z') : null;
      if (source) identity.saveReadwiseConnectionState(deviceConnection, source, '2026-09-16T00:00:00.000Z');
      else device.saveReadwiseDeviceConnection(deviceConnection);
      const driver = connection.openDatabaseConnection().driver;
      driver.execute(`INSERT INTO nodes
        (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
        VALUES ('legacy-topic',NULL,'topic','Unique restored title',0,'User-edited body',
          '2026-09-15T00:00:00.000Z','2026-09-16T00:00:00.000Z')`);
      driver.execute(`INSERT INTO desktop_sources
        (source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,
         type_settings_json,created_at,updated_at) VALUES
        ('readwise:t201','readwise','t201',?,'win32','D:\\Missing','windows',?,
          '2026-09-15T00:00:00.000Z','2026-09-16T00:00:00.000Z')`,
      [assignment.current_host_name, JSON.stringify({ kind: 'articles' })]);
      driver.execute(`INSERT INTO import_sources
        (source_fingerprint,provider,source_kind,source_name,source_locator,first_imported_at,
         last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location)
        VALUES ('t201-source','desktop_text_file','markdown','Unique restored title.md','missing',
          '2026-09-15T00:00:00.000Z','2026-09-16T00:00:00.000Z','hash','legacy-topic',
          'readwise:t201','Unique restored title.md')`);
      if (source) {
        reset.restartIncompleteReadwiseSourceCutover({
          connectionRef: source.connectionRef,
          sourceHost: assignment.current_host_name,
          startedAt: '2026-09-16T00:00:00.000Z'
        });
      }
    });
  }, pendingCutover);
}

async function installFailedTransport(app: ElectronApplication) {
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __t201FailedRequest?: boolean };
    runtime.__t201FailedRequest = false;
    runtime.fetch = async () => {
      runtime.__t201FailedRequest = true;
      return new Response(null, { status: 400 });
    };
  });
}

async function installRecoveringTransport(app: ElectronApplication) {
  await app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __t201Release?: () => void };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    runtime.__t201Release = release;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v3/list/') {
        await gate;
        return Response.json({ count: 1, nextPageCursor: null, results: [{
          category: 'article', html_content: '<p>Remote replacement body</p>',
          id: 'remote-document', title: 'Unique restored title'
        }] });
      }
      if (url.pathname === '/api/v2/export/') {
        return Response.json({ count: 0, nextPageCursor: null, results: [] });
      }
      throw new Error(`unexpected_t201_request:${url}`);
    };
  });
}

async function setRendererOnline(session: T178AcceptanceSession) {
  const setOnline = () => Object.defineProperty(navigator, 'onLine', {
    configurable: true, value: true
  });
  await session.firstWindow.addInitScript(setOnline);
  await session.firstWindow.evaluate(setOnline);
}

async function releaseImport(app: ElectronApplication) {
  await app.evaluate(() => {
    (globalThis as typeof globalThis & { __t201Release?: () => void }).__t201Release?.();
  });
}

async function openSettingsFromNativeMenu(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      'foliole:native-menu-command',
      { commandId: 'workspace.openSettings' }
    );
  });
}

// SKIP: acceptance limited to macOS Hidden Native | 2026-09-16 | revive: plan requires another host or visible native
test.skip(
  process.platform !== 'darwin' || process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN !== '1',
  'T201 acceptance runs only in macOS Hidden Native mode.'
);

test('shows a retryable import failure and recovers without replacing the legacy Topic', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t201-'));
  let session: T178AcceptanceSession | null = null;
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedRestoredLibrary(session.electronApp, true);
    await installFailedTransport(session.electronApp);
    await setRendererOnline(session);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    await expect.poll(() => session!.electronApp.evaluate(() => Boolean(
      (globalThis as typeof globalThis & { __t201FailedRequest?: boolean }).__t201FailedRequest
    ))).toBe(true);
    await openSettingsFromNativeMenu(session.electronApp);
    await expect(getSettingsDialog(session.firstWindow)).toBeVisible();
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByRole('status').filter({
      hasText: /^(Migrating · Import failed|正在迁移 · 导入失败)/
    })).toBeVisible({ timeout: 30_000 });
    const retry = settings.getByRole('button', { name: /^(Retry migration|重试迁移)$/ });
    await expect(retry).toBeVisible();

    await installRecoveringTransport(session.electronApp);
    await retry.click();
    await expect(settings.getByRole('status').filter({
      hasText: /^(Migrating · Importing|正在迁移 · 导入中)/
    })).toBeVisible();
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'importing.png') });
    await releaseImport(session.electronApp);

    await expect.poll(() => session!.firstWindow.evaluate(async () => {
      const preview = await window.electronAPI.invoke('preview_readwise_source_cutover');
      return preview.status;
    }), { timeout: 30_000 }).toBe('already_completed');
    const persisted = await session.electronApp.evaluate(() => {
      const moduleApi = process.getBuiltinModule('module')!;
      const pathApi = process.getBuiltinModule('path')!;
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
      return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.queryOne(
        `SELECT n.id,n.content,i.remote_document_id FROM nodes n JOIN import_sources i
         ON i.latest_node_id=n.id WHERE n.id='legacy-topic'`
      ));
    });
    expect(persisted).toEqual({
      content: 'User-edited body', id: 'legacy-topic', remote_document_id: 'remote-document'
    });
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'completed.png') });
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test('uses the saved device token when a restored library has no API source identity', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t201-restored-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await seedRestoredLibrary(session.electronApp);
    await installRecoveringTransport(session.electronApp);
    await setRendererOnline(session);
    await session.firstWindow.reload();
    await expectWorkspaceShell(session.firstWindow);
    await openSettingsFromNativeMenu(session.electronApp);
    await expect(getSettingsDialog(session.firstWindow)).toBeVisible();
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await settings.getByRole('radio', { name: /^(API mode|API 模式)$/ }).click();
    const setup = session.firstWindow.getByRole('dialog', { name: /^(Set up API mode|设置 API 模式)$/ });
    await setup.getByRole('button', { name: /^(Continue setup|继续设置)$/ }).click();
    await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await settings.getByRole('button', { name: /^(Migrate to API mode…|迁移到 API 模式…)$/ }).click();
    const confirmation = session.firstWindow.getByRole('dialog', { name: /^(Switch to API mode|切换到 API 模式)$/ });
    await confirmation.getByRole('button', { name: /^(Switch and migrate|切换并迁移)$/ }).click();
    await expect(settings.getByRole('status').filter({
      hasText: /^(Migrating · Importing|正在迁移 · 导入中)/
    })).toBeVisible();
    await releaseImport(session.electronApp);
    await expect.poll(() => session!.firstWindow.evaluate(async () =>
      (await window.electronAPI.invoke('preview_readwise_source_cutover')).status
    ), { timeout: 30_000 }).toBe('already_completed');
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
