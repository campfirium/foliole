import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function runWatchedRecoveryJourney(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(async ({ app }, cwd) => {
    const fsApi = process.getBuiltinModule('fs');
    const cryptoApi = process.getBuiltinModule('crypto');
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!cryptoApi || !fsApi || !moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const libraryHome = process.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const runId = cryptoApi.randomUUID();
    const sourceId = `t135-18-watched-${runId}`;
    const topicTitle = `Watched Topic ${runId.slice(0, 8)}`;
    const firstRoot = pathApi.join(libraryHome, `${sourceId}-original`);
    const nextRoot = pathApi.join(libraryHome, `${sourceId}-reconnected`);
    fsApi.mkdirSync(firstRoot, { recursive: true });
    fsApi.writeFileSync(pathApi.join(firstRoot, 'topic.md'), `# ${topicTitle}\n\nOriginal body`, 'utf8');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const bindings = require(pathApi.join(cwd, 'dist/electron/database/watchedFolderBindings.js'));
    const importer = require(pathApi.join(cwd, 'dist/electron/import/keepImportService.js'));
    const reconnect = require(pathApi.join(cwd, 'dist/electron/import/watchedFolderReconnect.js'));
    const reimport = require(pathApi.join(cwd, 'dist/electron/import/currentSourceReimport.js'));
    return connection.runWithDatabaseConnectionOwner(async () => {
      const source = {
        actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
        id: sourceId, keepPreview: null, keepState: 'enabled', primaryPath: firstRoot
      };
      const binding = bindings.upsertChangedWatchedFolderSource(source, '2026-08-22T11:20:00.000Z');
      await importer.runKeepImportRule({
        directoryPath: firstRoot, highlightPolicy: 'reference_only', ruleId: source.id, sourceType: 'generic'
      });
      const driver = connection.openDatabaseConnection().driver;
      const original = driver.queryOne(
        `SELECT latest_node_id, source_fingerprint FROM import_sources
         WHERE watched_binding_id = ? AND watched_relative_path = 'topic.md'`, [binding.binding_id]
      );
      fsApi.rmSync(firstRoot, { recursive: true });
      const missingTopic = driver.queryOne('SELECT id, deleted_at FROM nodes WHERE id = ?', [original.latest_node_id]);
      bindings.disconnectWatchedFolderBinding(binding.binding_id);
      fsApi.mkdirSync(nextRoot, { recursive: true });
      fsApi.writeFileSync(pathApi.join(nextRoot, 'topic.md'), `# ${topicTitle}\n\nRecovered body`, 'utf8');
      fsApi.writeFileSync(pathApi.join(nextRoot, 'new.md'), '# New Watched Topic\n\nNew location body', 'utf8');
      const preview = await reconnect.previewWatchedFolderReconnect(binding.binding_id, nextRoot);
      await reconnect.confirmWatchedFolderReconnect({ bindingId: binding.binding_id, folderPath: nextRoot });
      await importer.runKeepImportRule({
        directoryPath: nextRoot, highlightPolicy: 'reference_only', ruleId: binding.binding_id, sourceType: 'generic'
      });
      const reimported = await reimport.reimportCurrentTopicSource(original.latest_node_id);
      const mappings = driver.queryAll(
        `SELECT latest_node_id, source_fingerprint, source_location FROM import_sources
         WHERE watched_binding_id = ? ORDER BY source_location`, [binding.binding_id]
      );
      return { mappings, missingTopic, original, preview, reimported, topicTitle, userData: app.getPath('userData') };
    });
  }, process.cwd());
}

test('keeps Watched topics and Locations stable through loss, recovery, and root replacement', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const journey = await runWatchedRecoveryJourney(desktopApp);
  expect(journey.missingTopic).toEqual({ deleted_at: null, id: journey.original.latest_node_id });
  expect(journey.preview).toMatchObject({ matched_count: 1, missing_count: 0, new_count: 1 });
  expect(journey.reimported).toMatchObject({ node_id: journey.original.latest_node_id, status: 'reimported' });
  expect(journey.mappings).toEqual([
    expect.objectContaining({ source_location: 'new.md' }),
    {
      latest_node_id: journey.original.latest_node_id,
      source_fingerprint: journey.original.source_fingerprint,
      source_location: 'topic.md'
    }
  ]);

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('treeitem', { name: journey.topicTitle, exact: true }).click();
  await expect(desktopWindow.getByText('Recovered body', { exact: true })).toBeVisible();
  const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
    't135-18-watched-source-recovery-hidden-native.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('t135-18-watched-source-recovery', { path: screenshotPath, contentType: 'image/png' });
});
