import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

test('configures cleanup, moves an unused attachment, restores it for reading, and explicitly empties trash', async ({ desktopApp, desktopWindow: page }) => {
  test.setTimeout(180_000);
  await expectWorkspaceShell(page);
  const key = await desktopApp.evaluate(({ nativeImage }) => {
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const crypto = process.getBuiltinModule('crypto')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { assetsDir } = require(pathApi.join(process.cwd(), 'dist/electron/database/runtimeDataPaths.js')).resolveRuntimeDataPaths();
    const bytes = nativeImage.createFromPath(pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png')).resize({ width: 97 }).toPNG();
    const key = `${crypto.createHash('sha256').update(bytes).digest('hex')}.png`;
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(pathApi.join(assetsDir, key), bytes);
    return key;
  });
  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /^(Storage|存储)$/ }).click();
  const section = settings.getByRole('region', { name: /^(Local attachments|本机附件)$/ });
  await expect(section).toBeVisible();
  const threshold = section.getByRole('spinbutton', { name: /^(Cleanup threshold|清理阈值)$/ });
  await threshold.fill('1');
  await threshold.press('Tab');
  await expect(section.getByRole('button', { name: /^(Clean up|清理)$/, exact: true })).toBeEnabled();
  await page.evaluate(async () => window.electronAPI!.invoke('maintain_attachments', { action: 'observe' }));
  await section.getByRole('button', { name: /^(Clean up|清理)$/, exact: true }).click();
  await expect(section.getByRole('button', { name: /^(Restore all|全部恢复)$/ })).toBeEnabled();
  const restored = await desktopApp.evaluate((_, storageKey) => {
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { assetsDir } = require(pathApi.join(process.cwd(), 'dist/electron/database/runtimeDataPaths.js')).resolveRuntimeDataPaths();
    const before = fs.existsSync(pathApi.join(`${assetsDir}.trash`, storageKey));
    const result = require(pathApi.join(process.cwd(), 'dist/electron/attachments/resourceResolver.js')).resolveAttachmentFile(storageKey);
    return { before, status: result.status, active: fs.existsSync(pathApi.join(assetsDir, storageKey)), trash: fs.existsSync(pathApi.join(`${assetsDir}.trash`, storageKey)) };
  }, key);
  expect(restored).toEqual({ before: true, status: 'ready', active: true, trash: false });
  await desktopApp.evaluate((_, storageKey) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { assetsDir } = require(pathApi.join(process.cwd(), 'dist/electron/database/runtimeDataPaths.js')).resolveRuntimeDataPaths();
    require(pathApi.join(process.cwd(), 'dist/electron/attachments/attachmentTrashFiles.js')).moveAttachmentToTrash(assetsDir, storageKey);
  }, key);
  await section.getByRole('button', { name: /^(Refresh|刷新)$/, exact: true }).click();
  await section.getByRole('button', { name: /^(Restore all|全部恢复)$/ }).click();
  await expect(section.getByRole('button', { name: /^(Restore all|全部恢复)$/ })).toBeDisabled();
  await desktopApp.evaluate((_, storageKey) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { assetsDir } = require(pathApi.join(process.cwd(), 'dist/electron/database/runtimeDataPaths.js')).resolveRuntimeDataPaths();
    require(pathApi.join(process.cwd(), 'dist/electron/attachments/attachmentTrashFiles.js')).moveAttachmentToTrash(assetsDir, storageKey);
  }, key);
  await section.getByRole('button', { name: /^(Refresh|刷新)$/, exact: true }).click();
  await section.getByRole('button', { name: /^(Empty trash|清空回收站)$/, exact: true }).click();
  await page.getByRole('dialog', { name: /^(Empty trash|清空回收站)$/, exact: true }).getByRole('button', { name: /^(Empty trash|清空回收站)$/, exact: true }).click();
  await expect(section.getByRole('button', { name: /^(Restore all|全部恢复)$/ })).toBeDisabled();
  const result = await page.evaluate(async () => window.electronAPI!.invoke('maintain_attachments', { action: 'status' }));
  expect(result).toMatchObject({ observationThreshold: 1, trashBytes: 0, eligibleBytes: 0 });
  await mkdir(path.resolve('.tmp/artifacts/S203'), { recursive: true });
  await page.screenshot({ path: path.resolve('.tmp/artifacts/S203/desktop-attachment-storage.png') });
});
