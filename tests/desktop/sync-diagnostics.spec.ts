import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('opens sync diagnostics, displays a recorded manual failure and copies a private-data-free report', async ({ desktopSession }, info) => {
  const page = desktopSession.firstWindow;
  await expectWorkspaceShell(page);
  await openSettingsCategory(page, 'Sync');
  await page.getByRole('button', { name: /^(View log|查看日志)$/ }).click();
  const empty = page.getByRole('dialog', { name: /^(Sync log|同步日志)$/ });
  await expect(empty.getByText(/No sync activity recorded yet|尚无同步记录/)).toBeVisible();
  await empty.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const failure = await page.evaluate(async () => {
    try { await window.electronAPI.invoke('sync_companion_now'); return null; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  });
  expect(failure).toContain('sync_group_peer_unavailable');
  await openSettingsCategory(page, 'Sync');
  await page.getByRole('button', { name: /^(View log|查看日志)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /^(Sync log|同步日志)$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Manual sync · Failed|手动同步 · 失败/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Details|详情)$/ }).first().click();
  await expect(dialog.getByText(/sync_group_peer_unavailable/).first()).toBeVisible();
  await dialog.getByRole('button', { name: /^(Refresh|刷新)$/ }).click();
  await expect(dialog.getByText(/Manual sync · Failed|手动同步 · 失败/)).toBeVisible();
  const imagePath = path.resolve('.tmp/artifacts/desktop-acceptance/sync-diagnostics.png');
  await mkdir(path.dirname(imagePath), { recursive: true });
  await page.screenshot({ path: imagePath });
  await info.attach('sync-diagnostics', { path: imagePath, contentType: 'image/png' });
  const report = await page.evaluate(async () => {
    const result = await window.electronAPI.invoke('load_desktop_sync_diagnostics');
    return result.report_text;
  });
  expect(report).toContain('sync_group_peer_unavailable');
  expect(report).not.toMatch(/\/Users\/|database_path|canonical_library_path/);
  await dialog.getByRole('button', { name: /^(Copy log summary|复制日志摘要)$/ }).click();
  await expect(dialog.getByRole('button', { name: /^(Copied|已复制)$/ })).toBeVisible();
  const clipboardText = await desktopSession.electronApp.evaluate(({ clipboard }) => clipboard.readText());
  expect(clipboardText).toContain('sync_group_peer_unavailable');
  expect(clipboardText).not.toMatch(/\/Users\/|database_path|canonical_library_path|https?:\/\/|Bearer /);
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await expect(dialog).toBeHidden();
});
