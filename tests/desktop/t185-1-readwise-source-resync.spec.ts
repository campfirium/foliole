import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import { createT178ApiAcceptanceSession, type T178AcceptanceSession } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t185-1');

async function installFixture(app: ElectronApplication) {
  await app.evaluate(({ clipboard }) => {
    const runtime = globalThis as typeof globalThis & {
      __T185_DIRECT_FETCH_COUNT__?: number;
      __T185_SOURCE_BODY__?: string;
    };
    runtime.__T185_DIRECT_FETCH_COUNT__ = 0;
    runtime.__T185_SOURCE_BODY__ = '<h1>Source</h1><p>Initial body from Readwise.</p>';
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [] });
      const direct = url.searchParams.get('id') === 't185-source';
      if (direct) runtime.__T185_DIRECT_FETCH_COUNT__ = (runtime.__T185_DIRECT_FETCH_COUNT__ ?? 0) + 1;
      return Response.json({
        nextPageCursor: null,
        results: [{
          category: 'article', html_content: runtime.__T185_SOURCE_BODY__, id: 't185-source',
          title: 'T185 Source', updated_at: '2026-09-13T00:00:00.000Z'
        }]
      });
    };
    clipboard.writeText('t185-token');
  });
}

async function seedReaderFixture(app: ElectronApplication) {
  await app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const materialization = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiMaterialization.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseReaderSettings.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      const importedAt = '2026-09-13T00:00:00.000Z';
      const connectionRef = identity.ensureReadwiseRemoteSource(false, importedAt).connectionRef;
      const result = materialization.materializeReadwiseApiDocument({
        config: settings.createDefaultReadwiseReaderConfig(), connectionRef, destination: 'inbox', importedAt,
        document: {
          annotations: [], body: '# Source\n\nInitial body from Readwise.', category: 'article',
          coverImageUrl: null, degradedReason: null, id: 't185-source',
          metadata: { author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'T185 Source' },
          title: 'T185 Source', unmatchedAnnotationCount: 0, updatedAt: importedAt
        }
      });
      if (result.status !== 'imported') throw new Error(`seed_failed:${JSON.stringify(result)}`);
    });
  });
}

async function connectAndCutover(session: T178AcceptanceSession) {
  const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
  await settings.getByRole('radio', { name: /^(API mode|API 模式)$/ }).click();
  const confirmation = session.firstWindow.getByRole('dialog', {
    name: /^(Switch to API mode|切换到 API 模式)$/
  });
  await confirmation.getByRole('button', { name: /^(Switch and migrate|切换并迁移)$/ }).click();
  await settings.getByRole('button', { name: /^(Connect Readwise|连接 Readwise)$/ }).click();
  await expect(settings.getByText(/^(Connected|已连接)$/)).toBeVisible();
  await expect(settings.getByLabel(/^(Sync frequency|同步频率)$/)).toBeVisible();
}

async function setRemoteBody(app: ElectronApplication, body: string) {
  await app.evaluate((_electron, nextBody) => {
    const runtime = globalThis as typeof globalThis & { __T185_SOURCE_BODY__?: string };
    runtime.__T185_SOURCE_BODY__ = nextBody;
  }, body);
}

async function inspect(app: ElectronApplication) {
  return app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __T185_DIRECT_FETCH_COUNT__?: number };
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const source = driver.queryOne(`SELECT latest_node_id nodeId, remote_import_state_json state
        FROM import_sources WHERE remote_document_id='t185-source'`);
      if (!source) return null;
      return {
        body: driver.queryOne('SELECT content FROM nodes WHERE id=?', [source.nodeId])?.content,
        directFetchCount: runtime.__T185_DIRECT_FETCH_COUNT__ ?? 0,
        nodeId: source.nodeId,
        state: JSON.parse(source.state)
      };
    });
  });
}

async function openResyncMenu(session: T178AcceptanceSession, nodeId: string) {
  await session.firstWindow.locator('[data-node-id="special-inbox"]').first().click();
  await session.firstWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click({ button: 'right' });
  const item = session.firstWindow.getByRole('menuitem', { name: /^(Resync from Readwise|从 Readwise 重新同步)$/ });
  await expect(item).toBeVisible();
  return item;
}

test('cancels safely and repeatedly resyncs one Reader source in place', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t185-1-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await installFixture(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    await connectAndCutover(session);
    await session.firstWindow.locator('[role="presentation"][aria-label="Settings"], [role="presentation"][aria-label="设置"]')
      .click({ position: { x: 5, y: 5 } });
    await seedReaderFixture(session.electronApp);
    const before = await inspect(session.electronApp);
    expect(before?.body).toContain('Initial body');
    await setRemoteBody(session.electronApp, '<h1>Source</h1><p>Second body from Readwise.</p>');

    await (await openResyncMenu(session, before!.nodeId)).click();
    await expect(session.firstWindow.getByRole('dialog')).toContainText(/Resync from Readwise|从 Readwise 重新同步/u);
    await session.firstWindow.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      body: expect.stringContaining('Initial body'), directFetchCount: 0, nodeId: before!.nodeId
    });

    await (await openResyncMenu(session, before!.nodeId)).click();
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const confirmation = path.join(ARTIFACT_DIR, `confirmation-${process.platform}.png`);
    await session.firstWindow.screenshot({ path: confirmation });
    await testInfo.attach('t185-1-confirmation', { contentType: 'image/png', path: confirmation });
    await session.firstWindow.getByRole('button', { name: /^(Resync|重新同步)$/ }).click();
    await expect(session.firstWindow.getByText(/^(Resynced from Readwise\.|已从 Readwise 重新同步。)$/)).toBeVisible();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      body: expect.stringContaining('Second body'), directFetchCount: 1, nodeId: before!.nodeId,
      state: { bodyAuthority: 'reader_html' }
    });

    await setRemoteBody(session.electronApp, '<h1>Source</h1><p>Third body from Readwise.</p>');
    await (await openResyncMenu(session, before!.nodeId)).click();
    await session.firstWindow.getByRole('button', { name: /^(Resync|重新同步)$/ }).click();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      body: expect.stringContaining('Third body'), directFetchCount: 2, nodeId: before!.nodeId
    });
    const completed = path.join(ARTIFACT_DIR, `completed-${process.platform}.png`);
    await session.firstWindow.screenshot({ path: completed });
    await testInfo.attach('t185-1-completed', { contentType: 'image/png', path: completed });
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
