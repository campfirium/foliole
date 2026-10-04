import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const bytes = (marker: number) => Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.from([marker])]);

async function seedFolders(desktopApp: ElectronApplication, sourceRoot: string) {
  await desktopApp.evaluate(async (_, { cwd, sourceRoot }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const sources = require(pathApi.join(cwd, 'dist/electron/database/desktopSources.js'));
    await connection.runWithDatabaseConnectionOwner(() => {
      for (const relative of ['Books', 'BooksOld', 'BooksOld/Topics']) {
        const folder = pathApi.join(sourceRoot, relative);
        const source = sources.upsertDesktopSource({ configRef: relative, rootPath: folder,
          sourceType: 'external', updatedAt: '2026-10-04T00:00:00.000Z' });
        connection.openDatabaseConnection().driver.execute(
          `INSERT INTO external_search_folders (id, folder_path, attachment_mode, attachment_root_path,
            excluded_dirs_json, status, document_count, created_at, updated_at, source_ref)
           VALUES (?, ?, 'document_relative_first_then_fixed_root', ?, '[]', 'ready', 1, ?, ?, ?)`,
          [relative, folder, pathApi.join(folder, 'attachments'), '2026-10-04T00:00:00.000Z',
            '2026-10-04T00:00:00.000Z', source.source_ref]
        );
      }
    });
  }, { cwd: process.cwd(), sourceRoot });
}

async function authorizeFile(desktopApp: ElectronApplication, filePath: string) {
  await desktopApp.evaluate(async (_, { cwd, filePath }) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    await require(pathApi.join(cwd, 'dist/electron/ipc/importPathAuthorization.js'))
      .authorizeSelectedImportFilePath(filePath);
  }, { cwd: process.cwd(), filePath });
}

test('imports and renders images from the containing external folder through the desktop bridge', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const sourceRoot = testInfo.outputPath('external-sources');
  for (const [index, relative] of ['Books', 'BooksOld', 'BooksOld/Topics'].entries()) {
    const attachments = path.join(sourceRoot, relative, 'attachments');
    await fs.mkdir(attachments, { recursive: true });
    await fs.writeFile(path.join(attachments, 'cover.png'), bytes(index + 1));
  }
  await seedFolders(desktopApp, sourceRoot);
  for (const [relative, marker] of [['BooksOld', 2], ['BooksOld/Topics', 3], ['BooksElsewhere', 0]] as const) {
    const filePath = path.join(sourceRoot, relative, 'topic.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `# ${relative}\n\n![Cover](cover.png)`);
    await authorizeFile(desktopApp, filePath);
    const result = await desktopWindow.evaluate((filePath) => window.electronAPI.invoke(
      'run_text_file_import', { file_path: filePath }
    ), filePath);
    expect(result?.result_status).toBe(marker ? 'imported' : 'degraded');
    if (!result?.node_id) throw new Error('Missing imported node');
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode(nodeId), result.node_id);
    const persisted = await desktopWindow.evaluate((nodeId) => (
      window.__folioleWorkspaceDebug?.getNode(nodeId)?.content ?? ''
    ), result.node_id);
    if (marker) {
      const hash = createHash('sha256').update(bytes(marker)).digest('hex');
      expect(persisted).toContain(`asset://${hash}.png`);
      const image = desktopWindow.locator(`[data-md-image-editor-node-id="${result.node_id}"] img`);
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    } else {
      expect(persisted).not.toContain('asset://');
      expect(result.degraded_reason).toContain('Missing local image');
    }
  }
  const screenshot = path.resolve('.tmp/artifacts/external-attachment-root/native.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('external-attachment-root', { path: screenshot, contentType: 'image/png' });
});
