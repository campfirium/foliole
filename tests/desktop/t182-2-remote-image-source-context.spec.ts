import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t182-2');
const IDS = {
  conflict: 't182-2-conflict',
  derived: 't182-2-derived',
  failure: 't182-2-failure',
  ordinary: 't182-2-ordinary',
  parent: 't182-2-parent'
};

type MainProbe = {
  queries: Array<{ params: unknown[]; sql: string }>;
  requests: Array<{ referer: string | null; url: string }>;
};

async function seedWorkspace(page: Page) {
  await page.evaluate(async ({ ids }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: '# Ordinary', id: ids.ordinary, kind: 'topic', title: 'Ordinary' },
      { content: '![Conflict](https://cdn.example/conflict.png)', id: ids.conflict, kind: 'topic', title: 'Conflict source' },
      { content: '---\nurl: https://parent.example/article\n---\n# Parent', id: ids.parent, kind: 'topic', title: 'Derived parent' },
      {
        anchorLink: { id: 't182-anchor', kind: 'highlight', locator: { from: 0, originalText: 'Parent', to: 6 } },
        content: '![Derived](https://derived-cdn.example/derived.png)', id: ids.derived, kind: 'item',
        parentNodeId: ids.parent, title: 'Derived child'
      },
      { content: '![Failure](https://failure-cdn.example/missing.png)', id: ids.failure, kind: 'topic', title: 'Learned failure' }
    ], { persist: true });
    window.localStorage.setItem('foliole-auto-localize-remote-images', 'false');
  }, { ids: IDS });
}

async function installMainProbe(app: ElectronApplication) {
  await app.evaluate(async (_electron, { ids }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const learned = require(pathApi.join(process.cwd(), 'dist/electron/attachments/remoteImageLearnedSources.js'));
    const pipeline = require(pathApi.join(process.cwd(), 'dist/electron/attachments/remoteImagePipeline.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      const sqlite = connection.openDatabaseConnection().sqlite;
      sqlite.prepare(`INSERT INTO import_sources
        (source_fingerprint, provider, source_kind, source_name, source_locator,
         first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id)
        VALUES ('t182-source', 'desktop_text_file', 'markdown', 'source.md', ?, ?, ?, 'hash', ?)`)
        .run('https://import.example/article', '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z', ids.conflict);
      sqlite.prepare(`INSERT INTO import_runs
        (id, source_fingerprint, provider, source_kind, source_name, source_locator,
         content_fingerprint, duplicate_semantic, result_status, node_id, imported_at)
        VALUES ('t182-run', 't182-source', 'desktop_text_file', 'markdown', 'source.md', ?,
          'hash', 'new', 'imported', ?, '2026-09-12T00:00:00.000Z')`)
        .run('https://run.example/article', ids.conflict);
      learned.learnRemoteImageSourceOrigin('https://cdn.example/conflict.png', 'https://learned.example/article');
      learned.learnRemoteImageSourceOrigin('https://failure-cdn.example/missing.png', 'https://failure-source.example/article');
    });
    const driver = connection.openDatabaseConnection().driver;
    const originalQueryOne = driver.queryOne.bind(driver);
    const originalQueryAll = driver.queryAll.bind(driver);
    globalThis.__t182RemoteImageProbe = { queries: [], requests: [] };
    const recordSourceQuery = (sql: string, params: unknown[]) => {
      if (new Error().stack?.includes('remoteImageSourceContext')) {
        globalThis.__t182RemoteImageProbe.queries.push({ params: [...params], sql });
      }
    };
    driver.queryOne = (sql, params = []) => {
      recordSourceQuery(sql, params);
      return originalQueryOne(sql, params);
    };
    driver.queryAll = (sql, params = []) => {
      recordSourceQuery(sql, params);
      return originalQueryAll(sql, params);
    };
    pipeline.resetRemoteImagePipelineForTests();
    pipeline.configureRemoteImagePipelineCacheRoot(pathApi.join(
      process.cwd(), '.tmp', 'desktop-acceptance', `t182-2-cache-${process.pid}-${Date.now()}`
    ));
    const png = Uint8Array.from(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    ));
    pipeline.configureRemoteImageFetchTransportForTests(async (url, init) => {
      const headers = new Headers(init.headers);
      const referer = headers.get('Referer');
      globalThis.__t182RemoteImageProbe.requests.push({ referer, url });
      if (url.includes('/missing.png') || !referer) return new Response(null, { status: 403 });
      return new Response(png, { headers: { 'content-type': 'image/png' }, status: 200 });
    });
  }, { ids: IDS });
}

async function openNode(page: Page, nodeId: string) {
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
  const opened = await page.evaluate(async (id) =>
    window.__folioleWorkspaceDebug?.openNode?.(id) ?? false, nodeId);
  expect(opened).toBe(true);
  await expect.poll(() => page.evaluate(
    () => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  )).toBe(nodeId);
}

async function expectImageLoaded(page: Page, alt: string) {
  const image = page.locator('.cm-md-image-surface:not(.cm-md-image-surface-loading)')
    .getByAltText(alt, { exact: true });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => ({
    complete: element.complete, width: element.naturalWidth
  }))).toEqual({ complete: true, width: 1 });
}

async function readProbe(app: ElectronApplication): Promise<MainProbe> {
  return app.evaluate(() => structuredClone(globalThis.__t182RemoteImageProbe));
}

async function attachEvidence(testInfo: TestInfo, evidence: unknown) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, 'remote-image-source-context.json');
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await testInfo.attach('t182-2-remote-image-source-context', { contentType: 'application/json', path: target });
}

test('keeps source priority and reuses failure provenance across retry', async (
  { desktopApp, desktopWindow }, testInfo
) => {
  test.setTimeout(120_000);
  await expectWorkspaceShell(desktopWindow);
  await seedWorkspace(desktopWindow);
  await installMainProbe(desktopApp);

  await openNode(desktopWindow, IDS.conflict);
  await expectImageLoaded(desktopWindow, 'Conflict');
  await openNode(desktopWindow, IDS.derived);
  await expectImageLoaded(desktopWindow, 'Derived');
  await openNode(desktopWindow, IDS.failure);
  await expect(desktopWindow.locator('.cm-md-image-status[data-md-image-status="unavailable"]')).toBeVisible();
  await desktopWindow.locator('.cm-md-image-status[data-md-image-status="unavailable"]').click({ button: 'right' });
  await expect(desktopWindow.getByRole('menuitem', { name: /Forget learned source|忘记/ })).toBeVisible();

  const beforeRetry = await readProbe(desktopApp);
  const failureReadsBefore = beforeRetry.queries.filter(({ params, sql }) =>
    sql.includes('SELECT id, parent_id, anchor_link') && params[0] === IDS.failure
  ).length;
  await desktopWindow.getByRole('menuitem', { name: /^(Retry|重试)$/ }).click();
  await expect.poll(async () => (await readProbe(desktopApp)).requests.length).toBeGreaterThan(beforeRetry.requests.length);
  await expect(desktopWindow.locator('.cm-md-image-status[data-md-image-status="unavailable"]')).toBeVisible();

  const afterRetry = await readProbe(desktopApp);
  const failureReadsAfter = afterRetry.queries.filter(({ params, sql }) =>
    sql.includes('SELECT id, parent_id, anchor_link') && params[0] === IDS.failure
  ).length;
  await attachEvidence(testInfo, { afterRetry, failureReadsBefore, failureReadsAfter });
  expect(failureReadsAfter).toBe(failureReadsBefore);
  expect(afterRetry.requests.some(({ referer, url }) =>
    url.includes('/conflict.png') && referer === 'https://import.example/')).toBe(true);
  expect(afterRetry.requests.some(({ referer, url }) =>
    url.includes('/derived.png') && referer === 'https://parent.example/')).toBe(true);
  expect(afterRetry.requests.filter(({ url }) => url.includes('/missing.png'))).toHaveLength(4);
  const querySql = afterRetry.queries.map(({ sql }) => sql).join('\n');
  expect(querySql).not.toMatch(/keep_import_items|node_attachments|attachments|pdf_page_text|loadNodeSourceDetails/i);
});

declare global {
  var __t182RemoteImageProbe: MainProbe;
}
