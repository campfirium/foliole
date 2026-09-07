import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../../scripts/desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../../scripts/desktop/macos-hidden-electron-runtime.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const TEST_TOKEN = 't178-4-acceptance-token';
type AcceptanceSession = Pick<DesktopSession, 'close' | 'electronApp' | 'firstWindow'>;

async function launchMacosSession(executablePath: string, stateRoot: string): Promise<AcceptanceSession> {
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: process.cwd(), env: process.env });
  const credential = resolveMacosHiddenCredentialSession(process.cwd(), runtime.runtimeFingerprint, stateRoot);
  const release = acquireMacosHiddenCredentialSessionLock(credential);
  const { _electron } = await import('playwright');
  const rendererUrl = pathToFileURL(path.resolve('dist/desktop/index.html')).toString();
  const electronApp = await _electron.launch({
    args: [credential.bootstrapPath], cwd: process.cwd(), executablePath,
    env: {
      ...process.env, ELECTRON_RENDERER_URL: rendererUrl, FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1', FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1', FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot,
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: credential.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.resolve('dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: path.join(stateRoot, 'library'),
      FOLIOLE_SESSION_DATA_PATH: credential.userDataPath, FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_USER_DATA_PATH: credential.userDataPath, FOLIOLE_WORKDIR: stateRoot
    },
    timeout: 90_000
  });
  const firstWindow = await electronApp.firstWindow({ timeout: 30_000 });
  await firstWindow.waitForURL(rendererUrl, { timeout: 30_000 });
  await firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
  return { close: async () => { await electronApp.close(); release(); runtime.cleanup(); }, electronApp, firstWindow };
}

async function createSession(stateRoot: string) {
  if (process.platform !== 'darwin') {
    return launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } }) as
      Promise<AcceptanceSession>;
  }
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: process.cwd(), env: process.env });
  const executablePath = runtime.executablePath;
  runtime.cleanup();
  return launchMacosSession(executablePath, stateRoot);
}

async function installApiFixture(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ clipboard }, token) => {
    const scope = globalThis as typeof globalThis & {
      __t178ImportMode?: 'interrupt' | 'normal' | 'resume'; __t178Requests?: string[];
    };
    scope.__t178ImportMode = 'normal';
    scope.__t178Requests = [];
    const article = (id: string, body: string) => ({
      category: 'article', html_content: `<p>${body}</p>`, id, title: id,
      updated_at: '2026-09-07T00:00:00.000Z'
    });
    scope.fetch = async (input, init) => {
      const url = new URL(String(input));
      scope.__t178Requests?.push(url.toString());
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') {
        return Response.json({ nextPageCursor: null, results: [{
          external_id: 'article-1', highlights: [{ external_id: 'highlight-1' }], source: 'reader'
        }] });
      }
      if (scope.__t178ImportMode === 'interrupt') {
        if (!url.searchParams.get('pageCursor')) {
          return Response.json({ nextPageCursor: 'resume-page', results: [article('article-3', 'Third body')] });
        }
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener(
          'abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }
        ));
      }
      if (scope.__t178ImportMode === 'resume') {
        return Response.json({ nextPageCursor: null, results: [article('article-4', 'Fourth body')] });
      }
      return Response.json({ nextPageCursor: null, results: [
        article('article-1', 'Body with quoted passage'),
        { category: 'highlight', html_content: '<p>quoted passage</p>', id: 'highlight-1', parent_id: 'article-1' },
        { category: 'note', html_content: '<p>Reader note</p>', id: 'note-1', parent_id: 'highlight-1' },
        article('article-2', 'Second body')
      ] });
    };
    clipboard.writeText(token);
  }, TEST_TOKEN);
}

async function capture(dialog: Locator, testInfo: TestInfo, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `${name}-${process.platform}.png`);
  await dialog.screenshot({ path: target });
  await testInfo.attach(name, { contentType: 'image/png', path: target });
}

async function resetRound(electronApp: ElectronApplication, mode: 'interrupt' | 'resume') {
  await electronApp.evaluate((_electron, input) => {
    const scope = globalThis as typeof globalThis & { __t178ImportMode?: string };
    scope.__t178ImportMode = input.mode;
    if (input.clear) {
      const moduleApi = process.getBuiltinModule('module');
      const pathApi = process.getBuiltinModule('path');
      if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
      const require = moduleApi.createRequire(pathApi.join(input.cwd, 'package.json'));
      const connection = require(pathApi.join(input.cwd, 'dist/electron/database/connection.js'));
      connection.runWithDatabaseConnectionOwner(() => {
        const driver = connection.openDatabaseConnection().driver;
        driver.execute('DELETE FROM readwise_api_import_stage');
        driver.execute('DELETE FROM readwise_api_import_runs');
      });
    }
  }, { clear: mode === 'interrupt', cwd: process.cwd(), mode });
}

test('imports, repeats safely, cancels, and resumes a Reader API round', async ({ browserName }, testInfo) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-4-'));
  let session: AcceptanceSession | null = null;
  try {
    session = await createSession(stateRoot);
    await installApiFixture(session.electronApp);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await expectWorkspaceShell(session.firstWindow);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await settings.getByLabel(/^(Readwise source mode|Readwise 来源模式)$/).selectOption('api');
    await settings.getByRole('button', { name: /^(Connect from clipboard|从剪贴板连接)$/ }).click();
    await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await settings.getByRole('radio', { name: /^(Inbox|收件箱)$/ }).last().click();

    const previewButton = settings.getByRole('button', { name: /^(Preview import|预览导入)$/ });
    await previewButton.click();
    let dialog = session.firstWindow.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
    await expect(dialog.getByText(/^(Source topics: 2|源主题：2)/)).toBeVisible();
    await capture(dialog, testInfo, 't178-4-api-first-preview');
    await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect(dialog).toHaveCount(0);

    const firstCounts = await inspectImportedState(session.electronApp, true);
    expect(firstCounts).toMatchObject({ importSources: 2, readwiseNodes: 4 });
    await previewButton.click();
    dialog = session.firstWindow.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
    await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(await inspectImportedState(session.electronApp, false)).toEqual(firstCounts);

    await previewButton.click();
    dialog = session.firstWindow.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
    await expect(dialog.getByRole('button', { name: /^(Import|导入)$/ })).toBeEnabled();
    await resetRound(session.electronApp, 'interrupt');
    await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect.poll(() => session!.electronApp.evaluate(() =>
      (globalThis as typeof globalThis & { __t178Requests?: string[] }).__t178Requests?.some(
        (url) => url.includes('pageCursor=resume-page')
      ))).toBe(true);
    await session.firstWindow.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(session.firstWindow.getByRole('dialog', {
      name: /^(Readwise import|Readwise import preview|Readwise 导入|Readwise 导入预览)$/
    })).toHaveCount(0);

    await resetRound(session.electronApp, 'resume');
    await previewButton.click();
    dialog = session.firstWindow.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
    await expect(dialog.getByText(/^(Source topics: 2|源主题：2)/)).toBeVisible();
    await capture(dialog, testInfo, 't178-4-api-resumed-preview');
    await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(await inspectImportedState(session.electronApp, false))
      .toMatchObject({ importSources: 4, readwiseNodes: 6 });
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});

async function inspectImportedState(electronApp: ElectronApplication, addLocalEdit: boolean) {
  return electronApp.evaluate((_electron, input) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(input.cwd, 'package.json'));
    const connection = require(pathApi.join(input.cwd, 'dist/electron/database/connection.js'));
    const mutations = require(pathApi.join(input.cwd, 'dist/lib/core/database/parentContentMutation.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const topic = driver.queryOne("SELECT n.id, n.title, CAST(cbd.data AS TEXT) content FROM import_sources i JOIN nodes n ON n.id=i.latest_node_id JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash WHERE i.remote_document_id='article-1'");
      if (input.addLocalEdit && topic) mutations.applyParentContentChange({
        driver, nextContent: `${topic.content}\n\nLocal edit`, nodeId: topic.id,
        previousContent: topic.content, title: topic.title, updatedAt: '2026-09-07T01:00:00.000Z'
      });
      const current = driver.queryOne("SELECT CAST(cbd.data AS TEXT) content FROM import_sources i JOIN nodes n ON n.id=i.latest_node_id JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash WHERE i.remote_document_id='article-1'");
      return {
        bodyPreserved: current?.content.includes('Local edit') ?? false,
        importSources: driver.queryOne("SELECT COUNT(*) count FROM import_sources WHERE remote_provider='readwise'").count,
        readwiseNodes: driver.queryOne(`SELECT COUNT(*) count FROM nodes WHERE deleted_at IS NULL AND
          (id LIKE 'node-readwise-%' OR import_source_fingerprint IN
            (SELECT source_fingerprint FROM import_sources WHERE remote_provider='readwise'))`).count
      };
    });
  }, { addLocalEdit, cwd: process.cwd() });
}
