import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const QUERY = 'T189-needle';
const TITLE_NODE = 't189-title-match';
const BODY_NODE = 't189-body-match';

async function fileHash(filePath: string) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

async function seedSearchBackup(page: Page) {
  await page.evaluate(async ({ bodyNode, query, titleNode }) => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([
      {
        content: '# Deleted original\n\nComplete deleted backup body.',
        id: titleNode,
        kind: 'topic',
        title: `${query} title result`
      },
      {
        content: `# Current body\n\n${query} appears in the second document.`,
        id: bodyNode,
        kind: 'topic',
        title: 'Body result'
      }
    ]);
    await globalThis.window?.__folioleWorkspaceDebug?.deleteNode?.(titleNode);
  }, { bodyNode: BODY_NODE, query: QUERY, titleNode: TITLE_NODE });
  return page.evaluate(async () => globalThis.window?.electronAPI?.invoke('backup_sqlite_database', {})) as Promise<{
    destinationPath: string;
  }>;
}

function updateBackupBodies(databasePath: string, replacement: string) {
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 5000');
  database.prepare('UPDATE nodes SET title = replace(title, ?, ?), content = replace(content, ?, ?)')
    .run(QUERY, replacement, QUERY, replacement);
  database.prepare('UPDATE content_blob_data SET data = replace(CAST(data AS TEXT), ?, ?)')
    .run(QUERY, replacement);
  database.close();
}

async function prepareManagedBackupSequence(compressedMatchPath: string) {
  const backupDirectory = path.dirname(compressedMatchPath);
  const base = gunzipSync(await fs.readFile(compressedMatchPath));
  const noMatchDatabase = path.join(backupDirectory, '.t189-no-match.db');
  const noMatch = path.join(backupDirectory, 'manual-2026-09-12_00-00-00-000.db.gz');
  const older = path.join(backupDirectory, 'manual-2026-09-10_00-00-00-000.db');
  const corrupt = path.join(backupDirectory, 'manual-2026-09-09_00-00-00-000.db');
  await fs.writeFile(noMatchDatabase, base);
  updateBackupBodies(noMatchDatabase, 'absent-word');
  await fs.writeFile(noMatch, gzipSync(await fs.readFile(noMatchDatabase)));
  await fs.rm(noMatchDatabase);
  await fs.writeFile(older, base);
  updateBackupBodies(older, `${QUERY} older-version`);
  await fs.writeFile(corrupt, 'not a sqlite database');
  const now = Date.now();
  await fs.utimes(noMatch, new Date(now + 20_000), new Date(now + 20_000));
  await fs.utimes(compressedMatchPath, new Date(now + 10_000), new Date(now + 10_000));
  await fs.utimes(older, new Date(now), new Date(now));
  await fs.utimes(corrupt, new Date(now - 10_000), new Date(now - 10_000));
  return [noMatch, compressedMatchPath, older, corrupt];
}

async function backupSearchDirectory(page: Page) {
  const userData = await page.evaluate(async () => {
    const paths = await globalThis.window?.electronAPI?.invoke('resolve_app_paths') as { app_data_dir: string };
    return paths.app_data_dir;
  });
  return path.join(userData, 'backup-search-sessions');
}

async function privateDatabaseCount(root: string) {
  const sessions = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const counts = await Promise.all(sessions.filter((entry) => entry.isDirectory()).map(async (entry) =>
    (await fs.readdir(path.join(root, entry.name))).filter((name) => name.endsWith('.db')).length));
  return counts.reduce((total, count) => total + count, 0);
}

test('searches managed backups one document at a time without changing source data', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const created = await seedSearchBackup(desktopWindow);
  const sourcePaths = await prepareManagedBackupSequence(created.destinationPath);
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
  const sourceHashes = await Promise.all(sourcePaths.map(fileHash));
  const matchingBackupName = path.basename(created.destinationPath);
  const libraryHash = await fileHash(databasePath);
  const searchRoot = await backupSearchDirectory(desktopWindow);

  const settings = await openBackupsSection(desktopWindow);
  const searchSection = settings.getByRole('region', { name: /^(Backup search section|搜索备份设置区)$/ });
  await searchSection.getByRole('button', { name: /^(Search backup content|搜索备份内容)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Search backup content|搜索备份内容)$/ });
  const input = dialog.getByRole('textbox', { name: /^(Search term|搜索词)$/ });
  await input.fill(QUERY);
  await expect.poll(() => privateDatabaseCount(searchRoot)).toBe(0);
  await dialog.getByRole('button', { name: /^(Search|搜索)$/ }).click();

  await expect(dialog.getByRole('button', { name: new RegExp(`${QUERY} title result`) })).toBeVisible();
  await expect(dialog.getByText(/^(In Trash|在废纸篓)$/)).toBeVisible();
  await expect(dialog.getByText(matchingBackupName, { exact: true }).first()).toBeVisible();
  await expect(dialog.locator('.markdown-editor-host')).toContainText('Complete deleted backup body.');
  await expect.poll(() => privateDatabaseCount(searchRoot)).toBe(1);

  await dialog.getByRole('button', { name: /^(Continue search|继续搜索)$/ }).click();
  await expect(dialog.getByRole('button', { name: /Body result/ })).toBeVisible();
  await expect(dialog.locator('.markdown-editor-host')).toContainText('appears in the second document');
  await dialog.getByRole('button', { name: /^(Continue search|继续搜索)$/ }).click();
  await expect(dialog.locator('.markdown-editor-host')).toContainText(`${QUERY} older-version`);
  await dialog.getByRole('button', { name: /Body result/ }).first().click();
  await expect(dialog.locator('.markdown-editor-host')).toContainText('appears in the second document');
  await dialog.getByRole('button', { name: /^(Continue search|继续搜索)$/ }).click();
  await expect(dialog).toContainText(/(?:could not be read|无法读取)/);
  await expect(dialog.getByRole('button', { name: /^(No more results|没有更多结果)$/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /^(Previous|上一个)$/ })).toHaveCount(0);

  const artifact = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance',
    process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1' ? 'backup-search-split-hidden.png' : 'backup-search-split-visible.png');
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await dialog.screenshot({ path: artifact });
  await testInfo.attach('backup-search', { contentType: 'image/png', path: artifact });
  await expect(Promise.all(sourcePaths.map(fileHash))).resolves.toEqual(sourceHashes);
  await expect(fileHash(databasePath)).resolves.toBe(libraryHash);

  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => privateDatabaseCount(searchRoot)).toBe(0);
});
