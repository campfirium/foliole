import process from 'node:process';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedSources(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const folders = require(`${process.cwd()}/dist/electron/database/externalSearchFolders.js`);
    const documents = require(`${process.cwd()}/dist/electron/database/externalDocuments.js`);
    const references = require(`${process.cwd()}/dist/lib/core/readwise/readwiseExternalReference.js`);
    await connection.runWithDatabaseConnectionOwner(() => {
      const root = process.env.FOLIOLE_LIBRARY_HOME;
      if (!root?.includes('foliole-playwright')) throw new Error('An isolated library is required');
      folders.saveExternalSearchFolders([{ id: 'mirror', folder_path: `${root}/sources`,
        attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null, excluded_dirs: [] }]);
      const folder = folders.loadExternalSearchFolders()[0];
      const driver = connection.openDatabaseConnection().driver;
      driver.execute(`UPDATE desktop_sources SET host_name = 'other-host',
        type_settings_json = json_set(type_settings_json, '$.ownerDeviceIdentityKey', 'remote-provider')
        WHERE config_ref = 'mirror'`);
      for (const [id, file] of [['mirror', 'mirror.md'], ['readwise-reader-import-articles', 'readwise.md']]) {
        documents.upsertExternalDocuments({ ...folder, id }, [{ absolutePath: `${root}/${file}`,
          content: '# ПРИМЕР ΠΑΡΑΔΕΙΓΜΑ\nmarker', extension: 'md', fileName: file,
          modifiedAt: '2026-10-20T00:00:00.000Z', modifiedMs: 1, relativePath: file, sizeBytes: 50 }], 'now');
      }
      driver.execute(`UPDATE external_documents SET reference_kind = 'readwise_remote', reference_json = ?
        WHERE folder_id = 'readwise-reader-import-articles'`, [references.serializeReadwiseExternalReference({
        connection_ref: 'fixture', remote_document_id: 'remote-doc', reader_url: null, source_url: null })]);
      driver.execute(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
        source_state, local_node_state, last_status, first_seen_at, last_seen_at)
        VALUES ('rule', '/Missing/retained.md', 1, 1, 'present', 'locally_deleted', 'blocked_deleted', 'now', 'now')`);
      driver.execute(`INSERT INTO keep_import_item_cache (rule_id, source_path, title, content, content_preview,
        source_mtime_ms, source_size_bytes, refreshed_at)
        VALUES ('rule', '/Missing/retained.md', ?, ?, ?, 1, 1, 'now')`,
      ['ПРИМЕР ΠΑΡΑΔΕΙΓΜΑ', 'ПРИМЕР ΠΑΡΑΔΕΙΓΜΑ marker', 'ПРИМЕР ΠΑΡΑΔΕΙΓΜΑ marker']);
    });
  });
}

test('searches uppercase mirror, Readwise and removed sources through native Unicode input', async ({ desktopApp, desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await seedSources(desktopApp);
  await page.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const prompt = page.getByRole('button', { name: /^(Not now|暂不)$/ });
  if (await prompt.isVisible()) await prompt.click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.getByPlaceholder(/搜索标题和正文|Search titles and content/) });
  const input = dialog.getByPlaceholder(/搜索标题和正文|Search titles and content/);
  const matches = dialog.getByRole('listitem');
  for (const query of ['рим', 'ραδ', 'пример', 'παραδειγμα', 'рим marker', 'ραδ AND marker', 'рим NOT absent']) {
    await input.fill(query);
    await expect(matches).toHaveCount(3);
  }
  await testInfo.attach('unicode-source-search', { body: await page.screenshot({
    path: `${process.cwd()}/.tmp/artifacts/unified-acceptance-20261020/t315-unicode-source-search.png` }), contentType: 'image/png' });
  for (const query of ['рим NOT marker', 'ραδ AND absent']) {
    await input.fill(query);
    await expect(matches).toHaveCount(0);
  }
  await input.fill('рим');
  await expect(matches).toHaveCount(3);
  for (const label of ['mirror.md', 'readwise.md', '/Missing/retained.md']) {
    await matches.filter({ hasText: label }).getByRole('button').click({ modifiers: ['Shift'] });
    const preview = page.getByRole('dialog', { name: /Search result preview|搜索结果预览/ });
    await expect(preview).toBeVisible();
    await expect(preview.getByText(/marker/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^(Search|搜索)$/ }).click();
    await input.fill('рим');
    await expect(matches).toHaveCount(3);
  }
  await desktopApp.evaluate(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    await connection.runWithDatabaseConnectionOwner(() => {
      require(`${process.cwd()}/dist/electron/database/externalFolderHostPreferences.js`).setExternalFolderEnabled('mirror', false);
      require(`${process.cwd()}/dist/electron/database/externalDocuments.js`).markExternalDocumentsMissing(
        [{ relativePath: 'readwise.md' }], 'readwise-reader-import-articles', '2026-10-20T00:00:00.000Z');
    });
  });
  await input.fill('ραδ');
  await expect(matches).toHaveCount(1);
  await testInfo.attach('source-removal-search', { body: await page.screenshot({
    path: `${process.cwd()}/.tmp/artifacts/unified-acceptance-20261020/t304-source-removal-search.png` }), contentType: 'image/png' });
});
