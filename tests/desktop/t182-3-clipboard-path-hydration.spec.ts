import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t182-3');
const IMAGE_HASH = 'a'.repeat(64);
const ASSET_NODE_ID = 't182-3-asset-copy';
const ASSET_MARKDOWN = `Anchor ![Cover](asset://${IMAGE_HASH}.png)`;
const ANSWER_NODE_ID = 't182-3-answer-cut';
const ANSWER = 'Answer CUTME remains';
const GLOBAL_NODE_ID = 't182-3-global-clip';
const GLOBAL_TEXT = 'T182 global clip payload';

async function preserveSystemClipboard(app: ElectronApplication) {
  await app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read();
    globalThis.__t182Clipboard = await Promise.all(items.map(async (item) => Object.fromEntries(
      await Promise.all(item.types.map(async (type) => [type, await item.getType(type)]))
    )));
  });
}

async function restoreSystemClipboard(app: ElectronApplication) {
  await app.evaluate(async ({ ClipboardItem, clipboard }) => {
    const payloads = globalThis.__t182Clipboard ?? [];
    if (payloads.length === 0) clipboard.clear();
    else await clipboard.write(payloads.map((payload) => new ClipboardItem(payload)));
    delete globalThis.__t182Clipboard;
  });
}

async function selectEditorText(page: Page, editorId: string, from: number, to: number) {
  await expect.poll(() => page.evaluate(({ editorId: id, from: start, to: end }) =>
    window.__folioleDebug?.setEditorSelection?.(id, start, end) ?? false, { editorId, from, to })).toBe(true);
}

async function readClipboardRepresentations(app: ElectronApplication) {
  return app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read();
    const item = items[0];
    const customType = item?.types.find((type) => type.includes('application/x-foliole')) ?? null;
    const custom = customType ? await item?.getType(customType) : null;
    const html = item?.types.includes('text/html') ? await item.getType('text/html') : null;
    return {
      custom: custom instanceof Blob ? await custom.text() : null,
      customType,
      formats: item?.types ?? [],
      html: html instanceof Blob ? await html.text() : '',
      text: await clipboard.readText()
    };
  });
}

async function runGlobalClip(app: ElectronApplication, staleAfterImport = false) {
  return app.evaluate(async ({ BrowserWindow, clipboard }, stale) => {
    const run = globalThis.__folioleRunGlobalClipToInboxForTests;
    const mainWindow = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!run || !mainWindow) throw new Error('global clip test hook unavailable');
    const events: string[] = [];
    const result = await run({
      log: (event) => events.push(event),
      presentIssue: async () => false,
      ...(stale ? {
        runImport: async () => {
          clipboard.writeText('newer clipboard value');
          return { import_id: 'stale-guard', node_id: 'none', source_kind: 'text', source_name: 'Selection' };
        }
      } : {}),
      runMacosCopy: async () => {
        mainWindow.webContents.copy();
        return { copyWritten: true, permission: 'granted' };
      },
      showDesktopToast: () => ({ close: () => undefined, update: () => undefined })
    });
    return { clipboardText: clipboard.readText(), events, result };
  }, staleAfterImport);
}

async function seedAcceptanceWorkspace(page: Page) {
  await page.evaluate(async (fixture) => {
    const api = window.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: fixture.assetMarkdown, id: fixture.assetNodeId, kind: 'topic', title: 'T182 asset copy' },
      { content: '# Prompt', id: fixture.answerNodeId, kind: 'item', reveal: fixture.answer, title: 'T182 answer cut' },
      { content: fixture.globalText, id: fixture.globalNodeId, kind: 'topic', title: 'T182 global clip' }
    ]);
    await api?.createTextHighlightChild?.({
      anchorId: 't182-3-anchor',
      anchorLink: { id: 't182-3-anchor', kind: 'highlight', locator: { from: 0, originalText: 'Anchor', to: 6 } },
      parentNodeId: fixture.assetNodeId,
      text: 'Anchor'
    });
    await api?.openNode?.(fixture.assetNodeId);
  }, { answer: ANSWER, answerNodeId: ANSWER_NODE_ID, assetMarkdown: ASSET_MARKDOWN,
    assetNodeId: ASSET_NODE_ID, globalNodeId: GLOBAL_NODE_ID, globalText: GLOBAL_TEXT });
}

async function acceptAssetCopy(app: ElectronApplication, page: Page, libraryHome: string) {
  await selectEditorText(page, 'prompt-editor', 0, ASSET_MARKDOWN.length);
  await page.keyboard.press('Meta+C');
  const copied = await readClipboardRepresentations(app);
  const expectedFileUrl = `file://${path.join(libraryHome, 'Assets', `${IMAGE_HASH}.png`)}`;
  const custom = JSON.parse(copied.custom ?? 'null') as { anchors?: unknown; internalText?: unknown } | null;
  expect(copied.text).toContain(expectedFileUrl);
  expect(copied.html).toContain(expectedFileUrl);
  expect(custom).toMatchObject({
    anchors: [{ from: 0, kind: 'highlight', to: 6 }],
    internalText: ASSET_MARKDOWN
  });
  return copied;
}

async function acceptAnswerCut(page: Page) {
  await page.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), ANSWER_NODE_ID);
  const cutFrom = ANSWER.indexOf('CUTME');
  await page.getByRole('button', { name: /^(Show answer|显示答案)$/ }).click();
  await selectEditorText(page, 'answer-editor', cutFrom, cutFrom + 'CUTME'.length);
  await page.keyboard.press('Meta+X');
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('answer-editor')))
    .toBe('Answer  remains');
  await page.keyboard.press(undoShortcut());
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('answer-editor')))
    .toBe(ANSWER);
}

async function acceptGlobalClip(app: ElectronApplication, page: Page) {
  await page.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), GLOBAL_NODE_ID);
  await selectEditorText(page, 'prompt-editor', 0, GLOBAL_TEXT.length);
  await app.evaluate(({ clipboard }) => clipboard.writeText('original clipboard marker'));
  const imported = await runGlobalClip(app);
  expect(imported.result).toMatchObject({ import_id: expect.any(String), node_id: expect.any(String) });
  expect(imported.clipboardText).toBe('original clipboard marker');
  expect(imported.events).toContain('global_clip_clipboard_restored');
  const importedNodeId = (imported.result as { node_id: string }).node_id;
  const importedDocument = await page.evaluate((nodeId) =>
    window.electronAPI?.invoke('load_node_document', { nodeId }), importedNodeId);
  expect(importedDocument).toMatchObject({ content: expect.stringContaining(GLOBAL_TEXT) });

  await selectEditorText(page, 'prompt-editor', 0, GLOBAL_TEXT.length);
  await app.evaluate(({ clipboard }) => clipboard.writeText('second clipboard marker'));
  const stale = await runGlobalClip(app, true);
  expect(stale.clipboardText).toBe('newer clipboard value');
  expect(stale.events).toContain('global_clip_clipboard_restore_skipped_changed');
  return { imported, stale };
}

test('hydrates clipboard paths and preserves copy, cut, and global clip contracts', async ({
  desktopApp,
  desktopSession,
  desktopWindow
}, testInfo) => {
  await preserveSystemClipboard(desktopApp);
  try {
    await expectWorkspaceShell(desktopWindow);
    await seedAcceptanceWorkspace(desktopWindow);
    const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const copied = await acceptAssetCopy(desktopApp, desktopWindow, libraryHome);
    await acceptAnswerCut(desktopWindow);
    const globalClip = await acceptGlobalClip(desktopApp, desktopWindow);
    const evidence = { copied, ...globalClip };
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const target = path.join(ARTIFACT_DIR, 'result.json');
    await fs.writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await testInfo.attach('t182-3-clipboard-path-hydration', { contentType: 'application/json', path: target });
  } finally {
    await restoreSystemClipboard(desktopApp);
  }
});

declare global {
  var __t182Clipboard: Array<Record<string, Blob>> | undefined;
}
