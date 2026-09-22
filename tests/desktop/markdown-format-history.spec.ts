import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const NODE = 'markdown-history';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const REDO = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y';
const OUT = path.resolve('.tmp/artifacts/editor-history-repair');

async function content(page: Page) {
  return page.evaluate(() => window.__folioleDebug?.getEditorContent('prompt-editor'));
}

async function select(page: Page, from: number, to = from) {
  expect(await page.evaluate(({ from, to }) =>
    window.__folioleDebug?.setEditorSelection('prompt-editor', from, to), { from, to })).toBe(true);
}

async function prepare(page: Page, initial: string) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await page.evaluate(async ({ id, content }) => window.__folioleWorkspaceDebug?.seedNodes?.([
    { id, content, kind: 'topic', title: 'Markdown history' }
  ], { persist: true }), { id: NODE, content: initial });
  await page.locator(`[role="treeitem"][data-node-id="${NODE}"]`).click();
  await expect.poll(() => content(page)).toBe(initial);
}

async function capture(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({
    content: await content(page),
    document: await loadNodeDocument(page, NODE),
    history: await page.evaluate(() => window.__folioleWorkspaceDebug?.getEditorOperationHistory?.())
  }, null, 2));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

for (const [key, marker] of [['b', '**'], ['i', '*']] as const) {
  test(`format ${key} preserves earlier typing history through undo and redo`, async ({ desktopWindow: page }) => {
    const original = 'Before important after';
    await prepare(page, original);
    await select(page, original.length);
    await page.keyboard.insertText(' typed');
    await expect.poll(() => content(page)).toBe(`${original} typed`);
    await select(page, 7, 16);
    await page.keyboard.press(`${MOD}+${key}`);
    const formatted = `Before ${marker}important${marker} after typed`;
    await expect.poll(() => content(page)).toBe(formatted);
    await page.keyboard.press(`${MOD}+Z`);
    await expect.poll(() => content(page)).toBe(`${original} typed`);
    await capture(page, `format-${key}-undo`);
    await page.keyboard.press(`${MOD}+Z`);
    await expect.poll(() => content(page)).toBe(original);
    await page.keyboard.press(REDO);
    await expect.poll(() => content(page)).toBe(`${original} typed`);
    await page.keyboard.press(REDO);
    await expect.poll(() => content(page)).toBe(formatted);
    await expect.poll(async () => (await loadNodeDocument(page, NODE))?.content).toBe(formatted);
    await capture(page, `format-${key}-redo`);
  });
}

test('fence completion and prior backticks remain undoable and redoable', async ({ desktopWindow: page }) => {
  await prepare(page, 'Start\n');
  await select(page, 6);
  await page.keyboard.type('``');
  await expect.poll(() => content(page)).toBe('Start\n``');
  await page.keyboard.type('`');
  await expect.poll(() => content(page)).toBe('Start\n```\n\n```');
  await page.keyboard.press(`${MOD}+Z`);
  await expect.poll(() => content(page)).toBe('Start\n``');
  await capture(page, 'fence-undo');
  await page.keyboard.press(`${MOD}+Z`);
  await expect.poll(() => content(page)).toBe('Start\n');
  await page.keyboard.press(REDO);
  await expect.poll(() => content(page)).toBe('Start\n``');
  await page.keyboard.press(REDO);
  await expect.poll(() => content(page)).toBe('Start\n```\n\n```');
  await expect.poll(async () => (await loadNodeDocument(page, NODE))?.content).toBe('Start\n```\n\n```');
  await capture(page, 'fence-redo');
});
