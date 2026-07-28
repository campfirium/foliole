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
const LONG_CURRENT_CONTENT = Array.from(
  { length: 60 },
  (_, index) => `Current paragraph ${index}: material for a sustained editing comparison.`
).join('\n');
const LONG_MANUAL_CONTENT = Array.from(
  { length: 120 },
  (_, index) => `Pasted paragraph ${index}: revised material for a sustained editing comparison.`
).join('\n');

async function seedTopic(desktopWindow: Page, content = CURRENT_CONTENT) {
  await desktopWindow.evaluate(async ({ content, nodeId, title }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    if (!api) throw new Error('missing workspace debug bridge');
    await api.seedNodes([{ content, id: nodeId, kind: 'topic', title }], { persist: true });
  }, { content, nodeId: NODE_ID, title: NODE_TITLE });
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
  const flowIsActive = await exitFlow.isVisible().catch(() => false)
    || await exitFlow.waitFor({ state: 'visible', timeout: 1_000 }).then(() => true).catch(() => false);
  if (flowIsActive) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
}

async function openManualComparison(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    window.dispatchEvent(new CustomEvent('foliole:document-comparison-view-toggle', { detail: { source: 'manual' } }));
  });
  const dialog = desktopWindow.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
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

test('ordinary comparison lives in the editor menu without a persistent header icon', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTopic(desktopWindow);
  await openSeededTopic(desktopWindow);

  await expect(desktopWindow.getByRole('button', { name: /Review Source Update|查看来源更新/ })).toHaveCount(0);
  await desktopWindow.getByRole('button', { name: /More editor options|更多编辑器选项/ }).click();
  const compareItem = desktopWindow.getByRole('menuitem', { name: /^(Compare with Draft|与改稿对比)$/ });
  await expect(compareItem).toBeVisible();
  await compareItem.click();

  const dialog = desktopWindow.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('pasted comparison draft survives close until an explicit write action', async ({ desktopApp, desktopWindow }) => {
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
  await expect(dialog.locator('.cm-content[contenteditable="true"]').last()).toContainText(
    MANUAL_CONTENT.replaceAll('\n', '')
  );

  await replaceManualContent(desktopWindow, dialog, REPLACEMENT_CONTENT);
  await dialog.getByRole('button', { name: /Set as body|设为正文/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => desktopWindow.evaluate((nodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(nodeId)?.content ?? null, NODE_ID)
  ).toBe(REPLACEMENT_CONTENT);

  dialog = await openManualComparison(desktopWindow);
  await expect(dialog.locator('.cm-content[contenteditable="true"]').last()).toHaveText('');
  await replaceManualContent(desktopWindow, dialog, CHILD_CONTENT);
  await dialog.getByRole('button', { name: /Save as new Topic|另存为新主题/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)).not.toBe(NODE_ID);
  const child = await desktopWindow.evaluate(() => {
    const id = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    return id ? globalThis.window?.__folioleWorkspaceDebug?.getNode?.(id) ?? null : null;
  });
  expect(child).toMatchObject({ content: CHILD_CONTENT, kind: 'topic', parentNodeId: NODE_ID });
});

test('contiguous temporary comparison diff lines only round their outer edges', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTopic(desktopWindow, 'Current alpha.\nCurrent beta.\nStable tail.');
  await openSeededTopic(desktopWindow);

  const dialog = await openManualComparison(desktopWindow);
  await replaceManualContent(desktopWindow, dialog, 'Pasted alpha.\nPasted beta.\nStable tail.');

  const addedLines = dialog.locator('.cm-content[contenteditable="true"]').last().locator('.cm-diff-line-added');
  await expect(addedLines).toHaveCount(2);
  await expect(addedLines.first()).toHaveClass(/cm-diff-line-first/);
  await expect(addedLines.first()).not.toHaveClass(/cm-diff-line-last/);
  await expect(addedLines.nth(1)).not.toHaveClass(/cm-diff-line-first/);
  await expect(addedLines.nth(1)).toHaveClass(/cm-diff-line-last/);

  const screenshotPath = path.resolve(
    '.tmp/artifacts/desktop-acceptance/temporary-comparison-contiguous-diff-radius.png'
  );
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
});

test('long temporary comparison remains editable after diff rendering', async ({ desktopApp, desktopWindow }) => {
  test.setTimeout(90_000);
  await expectWorkspaceShell(desktopWindow);
  await seedTopic(desktopWindow, LONG_CURRENT_CONTENT);
  await seedPendingSource(desktopApp);
  await openSeededTopic(desktopWindow);

  const dialog = await openManualComparison(desktopWindow);
  const editor = dialog.locator('.cm-content[contenteditable="true"]').last();
  await editor.click();
  await desktopWindow.keyboard.insertText(LONG_MANUAL_CONTENT);
  await expect(editor).toContainText('Pasted paragraph 119');

  const currentEditor = dialog.locator('.cm-content[contenteditable="true"]').first();
  for (let index = 0; index < 5; index += 1) {
    await editor.click();
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
    await desktopWindow.keyboard.type(` R${index}`, { delay: 80 });
    await desktopWindow.waitForTimeout(1_650);
    await currentEditor.click();
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
    await desktopWindow.keyboard.type(` L${index}`, { delay: 80 });
    await desktopWindow.waitForTimeout(1_650);
  }
  await expect(editor).toContainText('R0 R1 R2 R3 R4');
  await expect(currentEditor).toContainText('L0 L1 L2 L3 L4');
  await expect(dialog.locator('.cm-diff-line').first()).toBeVisible();
  const screenshotPath = path.resolve(
    '.tmp/artifacts/desktop-acceptance/temporary-comparison-long-editing.png'
  );
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });

  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
