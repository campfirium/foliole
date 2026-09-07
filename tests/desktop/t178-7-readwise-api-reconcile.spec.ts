import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');

async function installFixture(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ clipboard }) => {
    const state = globalThis as typeof globalThis & {
      __t178ReconcileMode?: 'deleted' | 'import' | 'interrupt' | 'present';
    };
    state.__t178ReconcileMode = 'import';
    state.fetch = async (input, init) => {
      const url = new URL(String(input));
      const mode = state.__t178ReconcileMode;
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (mode === 'interrupt' && url.searchParams.get('pageCursor') === 'blocked') {
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener(
          'abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }
        ));
      }
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: mode === 'deleted'
        ? [{ external_id: 'article-1', highlights: [{ external_id: 'highlight-1', is_deleted: true }],
          is_deleted: true, source: 'reader' }]
        : [{ external_id: 'article-1', highlights: [{ external_id: 'highlight-1', is_deleted: false }],
          is_deleted: false, source: 'reader' }] });
      if (mode === 'deleted') return Response.json({ nextPageCursor: null, results: [] });
      if (mode === 'interrupt') return Response.json({ nextPageCursor: 'blocked', results: [] });
      return Response.json({ nextPageCursor: null, results: [
        { category: 'article', html_content: '<p>Remote body</p>', id: 'article-1', title: 'Article' },
        { category: 'highlight', html_content: '<p>Excerpt</p>', id: 'highlight-1', parent_id: 'article-1' }
      ] });
    };
    clipboard.writeText('t178-7-token');
  });
}

async function setMode(desktopApp: ElectronApplication, mode: 'deleted' | 'interrupt' | 'present') {
  await desktopApp.evaluate((_electron, value) => {
    (globalThis as typeof globalThis & { __t178ReconcileMode?: string }).__t178ReconcileMode = value;
  }, mode);
}

async function inspect(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const row = driver.queryOne(`SELECT i.source_fingerprint fingerprint, i.remote_import_state_json state,
        CAST(cbd.data AS TEXT) content FROM import_sources i JOIN nodes n ON n.id=i.latest_node_id
        JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash WHERE i.remote_document_id='article-1'`);
      const sync = driver.queryOne(`SELECT sync_dirty FROM sync_object_state
        WHERE object_type='import_source' AND object_id=?`, [row.fingerprint]);
      return { content: row.content, state: JSON.parse(row.state), syncDirty: sync.sync_dirty };
    });
  });
}

async function capture(settings: Locator, testInfo: TestInfo) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `t178-7-readwise-reconcile-${process.platform}.png`);
  await settings.screenshot({ path: target });
  await testInfo.attach('t178-7-readwise-reconcile', { contentType: 'image/png', path: target });
}

test('reconciles complete remote sets, keeps incomplete sets unconfirmed, and preserves local content',
  async ({ browserName }, testInfo) => {
    void browserName;
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-7-'));
    let session: T178AcceptanceSession | null = null;
    try {
      session = await createT178ApiAcceptanceSession(stateRoot);
      await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
      await installFixture(session.electronApp);
      await expectWorkspaceShell(session.firstWindow);
      const importSettings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
      await importSettings.getByLabel(/^(Readwise source mode|Readwise 来源模式)$/).selectOption('api');
      await importSettings.getByRole('button', { name: /^(Connect from clipboard|从剪贴板连接)$/ }).click();
      await importSettings.getByRole('button', { name: /^(Preview import|预览导入)$/ }).click();
      const preview = session.firstWindow.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
      await preview.getByRole('button', { name: /^(Import|导入)$/ }).click();
      await expect(preview).toHaveCount(0);
      const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
      await settings.getByLabel(/^(Readwise source mode|Readwise 来源模式)$/).selectOption('api');

      await setMode(session.electronApp, 'deleted');
      await settings.getByRole('button', { name: /^(Reconcile status|对账远程状态)$/ }).click();
      await expect(settings.getByText(/^(Present: 0; Reader missing: 1; Export deleted: 1; Unconfirmed: 0.|仍存在：0；Reader 缺失：1；Export 已删除：1；未确认：0。)$/)).toBeVisible();
      expect(await inspect(session.electronApp)).toMatchObject({
        content: 'Remote body', state: { annotations: [{ remoteStatus: 'deleted' }],
          remoteLifecycle: { export: 'deleted', reader: 'missing' } }, syncDirty: 1
      });

      await setMode(session.electronApp, 'interrupt');
      await settings.getByRole('button', { name: /^(Reconcile status|对账远程状态)$/ }).click();
      await settings.getByRole('button', { name: /^(Cancel reconciliation|取消对账)$/ }).click();
      await expect(settings.getByText(/^(Reconciliation stopped.*|对账已停止.*)$/)).toBeVisible();
      expect((await inspect(session.electronApp)).state.remoteLifecycle).toMatchObject({
        export: 'unconfirmed', reader: 'unconfirmed'
      });

      await setMode(session.electronApp, 'present');
      await settings.getByRole('button', { name: /^(Reconcile status|对账远程状态)$/ }).click();
      await expect(settings.getByText(/^(Present: 1; Reader missing: 0; Export deleted: 0; Unconfirmed: 0.|仍存在：1；Reader 缺失：0；Export 已删除：0；未确认：0。)$/)).toBeVisible();
      expect(await inspect(session.electronApp)).toMatchObject({
        content: 'Remote body', state: { annotations: [{ remoteStatus: 'present' }],
          remoteLifecycle: { export: 'present', reader: 'present' } }, syncDirty: 1
      });
      await capture(settings, testInfo);
    } finally {
      await session?.close();
      await rm(stateRoot, { force: true, recursive: true });
    }
  });
