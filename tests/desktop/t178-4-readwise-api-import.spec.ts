import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const TEST_TOKEN = 't178-4-acceptance-token';

async function installApiFixture(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ clipboard }, token) => {
    const scope = globalThis as typeof globalThis;
    const article = (id: string, body: string) => ({
      category: 'article', html_content: `<p>${body}</p>`, id, title: id,
      updated_at: '2026-09-07T00:00:00.000Z'
    });
    scope.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') {
        return Response.json({ nextPageCursor: null, results: [{
          external_id: 'article-1', highlights: [{
            external_id: 'highlight-1', note: 'Reader note', text: 'quoted passage'
          }], source: 'reader'
        }] });
      }
      return Response.json({ nextPageCursor: null, results: [
        article('article-1', 'Body with quoted passage'),
        { category: 'highlight', id: 'highlight-1', parent_id: 'article-1' },
        { category: 'note', id: 'note-1', parent_id: 'highlight-1' },
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

test('starts automatically and repeats a Reader API import safely', async ({ browserName }, testInfo) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-4-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await installApiFixture(session.electronApp);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await expectWorkspaceShell(session.firstWindow);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await connectAndCutoverReadwiseApi(session.firstWindow, settings, 'inbox');
    await expect.poll(() => inspectImportedState(session!.electronApp, false)).toMatchObject({
      importSources: 2, readwiseNodes: 3
    });
    await capture(settings, testInfo, 't178-4-api-automatic-import');

    const firstCounts = await inspectImportedState(session.electronApp, true);
    expect(firstCounts).toMatchObject({ annotationContentPreserved: true, importSources: 2, readwiseNodes: 3 });
    await runApiImport(session.electronApp);
    expect(await inspectImportedState(session.electronApp, false)).toEqual(firstCounts);
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});

async function runApiImport(electronApp: ElectronApplication) {
  return electronApp.evaluate(async (_electron, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const apiImport = require(pathApi.join(cwd, 'dist/electron/import/readwiseApiImportRun.js'));
    return connection.runWithDatabaseConnectionOwner(() => apiImport.runReadwiseApiImport());
  }, process.cwd());
}

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
      const annotation = driver.queryOne("SELECT content FROM nodes WHERE id LIKE 'node-readwise-%' AND parent_id=?", [topic?.id]);
      return {
        annotationContentPreserved: annotation?.content.includes('quoted passage')
          && annotation.content.includes('Reader note'),
        bodyPreserved: current?.content.includes('Local edit') ?? false,
        importSources: driver.queryOne("SELECT COUNT(*) count FROM import_sources WHERE remote_provider='readwise'").count,
        readwiseNodes: driver.queryOne(`SELECT COUNT(*) count FROM nodes WHERE deleted_at IS NULL AND
          (id LIKE 'node-readwise-%' OR import_source_fingerprint IN
            (SELECT source_fingerprint FROM import_sources WHERE remote_provider='readwise'))`).count
      };
    });
  }, { addLocalEdit, cwd: process.cwd() });
}
