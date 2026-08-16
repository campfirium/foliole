import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import {
  createDegradedMultiChapterBookEpub,
  createMultiChapterBookEpub
} from '../../electron/import/readwiseBooksEndToEnd.fixture';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/epub-import-immediate-visibility.png');

async function installEpubSelection(desktopApp: ElectronApplication, fixturePath: string) {
  await desktopApp.evaluate(({ dialog }, selectedPath) => {
    const target = globalThis as typeof globalThis & {
      __folioleEpubVisibilityOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    target.__folioleEpubVisibilityOriginalShowOpenDialog ??= dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, fixturePath);
}

async function importEpub(
  desktopApp: ElectronApplication,
  desktopWindow: Page,
  fixturePath: string,
  modeName: 'Free reading' | 'Sequential reading'
) {
  await installEpubSelection(desktopApp, fixturePath);
  await desktopWindow.evaluate(() => window.dispatchEvent(new Event('foliole:file-import-request')));
  const modeDialog = desktopWindow.getByRole('dialog', { name: 'Choose reading mode' });
  await expect(modeDialog).toBeVisible();
  await modeDialog.getByRole('button', { name: new RegExp(`^${modeName}`) }).click();
  await expect(modeDialog).toBeHidden();
}

async function collectBook(desktopWindow: Page, title: string) {
  return desktopWindow.evaluate((bookTitle) => {
    const debug = window.__folioleWorkspaceDebug;
    const root = debug?.listNodes().find((node) => node.title === bookTitle) ?? null;
    if (!debug || !root) return null;
    const children = debug.listNodes()
      .map((node) => debug.getNode(node.id))
      .filter((node) => node?.parentNodeId === root.id)
      .map((node) => ({ id: node!.id, title: node!.title }));
    return { children, root };
  }, title);
}

async function expectReadableBook(desktopWindow: Page, title: string, chapterTitle: string, body: string) {
  await expect.poll(() => collectBook(desktopWindow, title)).toMatchObject({
    children: expect.arrayContaining([expect.objectContaining({ title: chapterTitle })]),
    root: expect.objectContaining({ title })
  });
  const book = await collectBook(desktopWindow, title);
  const chapter = book?.children.find((node) => node.title === chapterTitle);
  expect(chapter).toBeTruthy();
  expect(await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode(nodeId), chapter!.id)).toBe(true);
  await expect(desktopWindow.getByRole('main', { name: /Foliole workspace/ })).toContainText(body);
}

test('shows successful and degraded EPUB chapters immediately without restarting', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await fs.mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const completePath = await createMultiChapterBookEpub(path.dirname(SCREENSHOT_PATH), 'visibility-complete.epub');
  const degradedPath = await createDegradedMultiChapterBookEpub(path.dirname(SCREENSHOT_PATH), 'visibility-degraded.epub');
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  await importEpub(desktopApp, desktopWindow, completePath, 'Sequential reading');
  await expectReadableBook(desktopWindow, 'Manual Book', 'Chapter 1', 'First chapter keeps the early remembered quote');

  await importEpub(desktopApp, desktopWindow, degradedPath, 'Free reading');
  await expectReadableBook(desktopWindow, 'Degraded Book', 'Degraded Chapter 2', 'Second degraded chapter remains readable');

  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('epub-import-immediate-visibility', { path: SCREENSHOT_PATH });
});
