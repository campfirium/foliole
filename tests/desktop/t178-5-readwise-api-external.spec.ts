import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../../scripts/desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../../scripts/desktop/macos-hidden-electron-runtime.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import type { DesktopSession } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const TEST_TOKEN = 't178-5-external-token';
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
  await electronApp.evaluate(({ clipboard, shell }, token) => {
    const scope = globalThis as typeof globalThis & { __t178OpenedUrls?: string[] };
    scope.__t178OpenedUrls = [];
    shell.openExternal = async (url) => {
      scope.__t178OpenedUrls?.push(url);
    };
    scope.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') {
        return Response.json({ nextPageCursor: null, results: [] });
      }
      return Response.json({ nextPageCursor: null, results: [{
        category: 'article',
        html_content: '<h1>Remote External Article</h1><p>Searchable remote body</p>',
        id: 'external-article-1',
        source_url: 'https://example.com/source-article',
        title: 'Remote External Article',
        updated_at: '2026-09-08T00:00:00.000Z',
        url: 'https://readwise.io/reader/read/external-article-1'
      }] });
    };
    clipboard.writeText(token);
  }, TEST_TOKEN);
}

async function configureExternalImport(page: Page) {
  const settings = await openSettingsCategory(page, 'ReadwiseReader');
  await connectAndCutoverReadwiseApi(page, settings);
  await settings.getByRole('radio', { name: /^(External|外部)$/ }).last().click();
  await settings.getByRole('button', { name: /^(Preview import|预览导入)$/ }).click();
  const preview = page.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
  await expect(preview.getByText('Remote External Article')).toBeVisible();
  await preview.getByRole('button', { name: /^(Import|导入)$/ }).click();
  await expect(preview).toHaveCount(0);
  await page.locator('[role="presentation"][aria-label="Settings"], [role="presentation"][aria-label="设置"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(settings).toHaveCount(0);
}

async function capture(page: Page, testInfo: TestInfo) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `t178-5-readwise-api-external-${process.platform}.png`);
  await page.getByLabel(/^(Document area|文档区域)$/).screenshot({ path: target });
  await testInfo.attach('t178-5-readwise-api-external', { contentType: 'image/png', path: target });
}

test('browses, searches, previews, opens, and explicitly imports a Reader API External document', async ({ browserName }, testInfo) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-5-'));
  let session: AcceptanceSession | null = null;
  try {
    session = await createSession(stateRoot);
    const desktopApp = session.electronApp;
    const desktopWindow = session.firstWindow;
    await desktopWindow.setViewportSize({ width: 1600, height: 1000 });
    await installApiFixture(desktopApp);
    await expectWorkspaceShell(desktopWindow);
    await configureExternalImport(desktopWindow);

    const externalTree = desktopWindow.getByRole('tree', { name: /^(External folder tree|外部文件夹树)$/ });
    const readwiseGroup = externalTree.getByRole('treeitem', { name: /Readwise/ });
    await expect(readwiseGroup).toBeVisible();
    if (await readwiseGroup.getAttribute('aria-expanded') === 'false') {
      await readwiseGroup.locator('[data-node-tree-chevron="true"]').click();
    }
    await externalTree.getByRole('treeitem', { name: /Articles/ }).click();
    const currentFolder = desktopWindow.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
    await expect(currentFolder.getByRole('button', { name: /List by|排序列表/ })).toBeVisible();
    await currentFolder.getByRole('button', { name: /^(Open title search|打开标题搜索)$/ }).click();
    await desktopWindow.getByRole('searchbox', { name: /^(Search topic titles|搜索主题标题)$/ })
      .fill('Remote External');
    const article = desktopWindow.getByRole('tree', { name: /^(External folder contents|外部文件夹内容)$/ })
      .getByRole('treeitem', { name: /Remote External Article/ });
    await expect(article).toBeVisible();
    await article.click();

    const documentArea = desktopWindow.getByLabel(/^(Document area|文档区域)$/);
    await expect(documentArea.getByText('Searchable remote body')).toBeVisible();
    await expect(documentArea.getByText(/file:\/\/|[A-Z]:\\/)).toHaveCount(0);
    await capture(desktopWindow, testInfo);
    await documentArea.getByRole('button', { name: /^(Open source|打开原文)$/ }).click();
    await documentArea.getByRole('button', { name: /^(Open in Reader|在 Reader 中打开)$/ }).click();
    await expect.poll(() => desktopApp.evaluate(() =>
      (globalThis as typeof globalThis & { __t178OpenedUrls?: string[] }).__t178OpenedUrls
    )).toEqual([
      'https://example.com/source-article',
      'https://readwise.io/reader/read/external-article-1'
    ]);

    await documentArea.getByRole('button', { name: /^(Import to Foliole|导入到 Foliole)$/ }).click();
    await expect.poll(() => inspectPresentation(desktopApp)).toEqual({ activeExternal: 0, imports: 1 });
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});

async function inspectPresentation(electronApp: ElectronApplication) {
  return electronApp.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return {
        activeExternal: driver.queryOne(
          "SELECT COUNT(*) count FROM external_documents WHERE reference_kind='readwise_remote' AND is_present=1"
        ).count,
        imports: driver.queryOne(
          "SELECT COUNT(*) count FROM import_sources WHERE remote_provider='readwise' AND remote_document_id='external-article-1'"
        ).count
      };
    });
  });
}
