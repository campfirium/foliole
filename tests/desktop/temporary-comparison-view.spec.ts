import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-temporary-comparison-topic';
const NODE_TITLE = 'Playwright Temporary Comparison Topic';
const CURRENT_CONTENT = 'Original paragraph one.\n\nOriginal paragraph two.';
const SOURCE_CONTENT = 'Imported paragraph one.\n\nOriginal paragraph two.';
const MANUAL_CONTENT = 'Pasted paragraph one.\n\nPasted paragraph two.';
const REPLACEMENT_CONTENT = 'Replacement body from the temporary comparison view.';
const CHILD_CONTENT = 'Alternative child Topic from the temporary comparison view.';

async function seedTopic(desktopWindow: Page) {
  await desktopWindow.evaluate(async ({ content, nodeId, title }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    if (!api) throw new Error('missing workspace debug bridge');
    await api.seedNodes([{ content, id: nodeId, kind: 'topic', title }], { persist: true });
  }, { content: CURRENT_CONTENT, nodeId: NODE_ID, title: NODE_TITLE });
}

async function seedPendingSource(desktopApp: ElectronApplication) {
  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  const dbPath = path.join(libraryHome, 'Data', 'foliole.db');
  const script = [
    "const Database = require('better-sqlite3');",
    'const db = new Database(process.argv[1]);',
    'db.prepare(`INSERT INTO incoming_updates (id, topic_id, source_type, source_path, updated_content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(process.argv[2], process.argv[3], "import_file", process.argv[4], process.argv[5], "pending", "2026-07-26T00:00:00.000Z", "2026-07-26T00:00:10.000Z");',
    'db.close();'
  ].join('\n');
  const distPath = path.join(process.cwd(), 'node_modules', 'electron', 'dist');
  const executablePath = process.platform === 'darwin'
    ? path.join(distPath, 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(distPath, process.platform === 'win32' ? 'electron.exe' : 'electron');
  execFileSync(executablePath, [
    '-e', script, dbPath, 'playwright-temporary-comparison-update', NODE_ID,
    'playwright/temporary-comparison.md', SOURCE_CONTENT
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'pipe'
  });
}

async function openSeededTopic(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('special-inbox');
  });
  await desktopWindow.evaluate(async (nodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId);
  }, NODE_ID);
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)).toBe(NODE_ID);
  const exitFlow = desktopWindow.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.count()) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
}

async function openManualComparison(desktopWindow: Page) {
  await desktopWindow.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const commandDialog = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await commandDialog.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('Compare');
  await commandDialog.getByRole('button', { name: /^(Compare with Draft|与改稿对比)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Pasted draft|粘贴改稿/ }).click();
  return dialog;
}

async function replaceManualContent(desktopWindow: Page, dialog: ReturnType<Page['getByRole']>, content: string) {
  const editor = dialog.locator('.cm-content[contenteditable="true"]').last();
  await editor.click();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await desktopWindow.keyboard.insertText(content);
  await expect(editor).toContainText(content.replaceAll('\n', ''));
  await expect(dialog.getByRole('button', { name: /Set as body|设为正文/ })).toBeEnabled();
  return editor;
}

test('temporary comparison draft is disposable until an explicit write action', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTopic(desktopWindow);
  await seedPendingSource(desktopApp);
  await openSeededTopic(desktopWindow);

  let dialog = await openManualComparison(desktopWindow);
  let editor = await replaceManualContent(desktopWindow, dialog, MANUAL_CONTENT);
  await expect(dialog.getByLabel(/Comparison overview ruler|对比概览标尺/).getByRole('button').first()).toBeVisible();
  await dialog.getByRole('button', { name: /Source update|来源更新/ }).click();
  await dialog.getByRole('button', { name: /Pasted draft|粘贴改稿/ }).click();
  editor = dialog.locator('.cm-content[contenteditable="true"]').last();
  await expect(editor).toContainText(MANUAL_CONTENT.replaceAll('\n', ''));

  const screenshotPath = path.resolve('.tmp/artifacts/desktop-acceptance/temporary-comparison-view.png');
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });

  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  dialog = await openManualComparison(desktopWindow);
  await expect(dialog.locator('.cm-content[contenteditable="true"]').last()).toHaveText('');

  await replaceManualContent(desktopWindow, dialog, REPLACEMENT_CONTENT);
  await dialog.getByRole('button', { name: /Set as body|设为正文/ }).click();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(nodeId)?.content ?? null, NODE_ID)
  ).toBe(REPLACEMENT_CONTENT);

  dialog = await openManualComparison(desktopWindow);
  await replaceManualContent(desktopWindow, dialog, CHILD_CONTENT);
  await dialog.getByRole('button', { name: /Save as new Topic|另存为新主题/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)).not.toBe(NODE_ID);
  const child = await desktopWindow.evaluate(() => {
    const id = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    return id ? globalThis.window?.__folioleWorkspaceDebug?.getNode?.(id) ?? null : null;
  });
  expect(child).toMatchObject({ content: CHILD_CONTENT, kind: 'topic', parentNodeId: NODE_ID });
});
