import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { redoShortcut, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-t174-answer-cut';
const BODY = '# Prompt\n\nBody stays unchanged';
const ANSWER = 'Answer CUTME remains';
const CUT_FROM = ANSWER.indexOf('CUTME');
const CUT_TO = CUT_FROM + 'CUTME'.length;
const CUT_ANSWER = `${ANSWER.slice(0, CUT_FROM)}${ANSWER.slice(CUT_TO)}`;

async function preserveSystemClipboard(app: ElectronApplication) {
  await app.evaluate(async ({ clipboard }) => {
    const target = globalThis as typeof globalThis & { t174Clipboard?: Array<Record<string, Blob>> };
    const items = await clipboard.read();
    target.t174Clipboard = await Promise.all(items.map(async (item) => Object.fromEntries(
      await Promise.all(item.types.map(async (type) => [type, await item.getType(type)]))
    )));
  });
}

async function restoreSystemClipboard(app: ElectronApplication) {
  await app.evaluate(async ({ ClipboardItem, clipboard }) => {
    const target = globalThis as typeof globalThis & { t174Clipboard?: Array<Record<string, Blob>> };
    const payloads = target.t174Clipboard ?? [];
    if (payloads.length === 0) clipboard.clear();
    else await clipboard.write(payloads.map((payload) => new ClipboardItem(payload)));
    delete target.t174Clipboard;
  });
}

async function collectState(page: Page) {
  return page.evaluate((nodeId) => ({
    answer: window.__folioleDebug?.getEditorContent?.('answer-editor') ?? null,
    body: window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null,
    persistedAnswer: window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.reveal ?? null,
    selection: window.__folioleDebug?.getEditorSelection?.('answer-editor') ?? null
  }), NODE_ID);
}

test('cuts and replays answer history without crossing into the prompt', async ({ desktopApp, desktopWindow }) => {
  await preserveSystemClipboard(desktopApp);
  try {
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate(async (seed) => window.__folioleWorkspaceDebug?.seedNodes?.([seed]), {
      content: BODY,
      id: NODE_ID,
      kind: 'item',
      reveal: ANSWER,
      title: 'T174 answer cut'
    });
    const revealAnswer = desktopWindow.getByRole('button', { name: /^(Show answer|显示答案)$/ });
    await expect(revealAnswer).toBeVisible();
    await revealAnswer.click();
    await expect.poll(() => collectState(desktopWindow)).toMatchObject({ answer: ANSWER, body: BODY });

    await expect.poll(() => desktopWindow.evaluate(({ from, to }) => (
      window.__folioleDebug?.setEditorSelection?.('answer-editor', from, to) ?? false
    ), { from: CUT_FROM, to: CUT_TO })).toBe(true);
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+X' : 'Control+X');

    await expect.poll(() => desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe('CUTME');
    await expect.poll(() => collectState(desktopWindow)).toMatchObject({
      answer: CUT_ANSWER,
      body: BODY,
      persistedAnswer: CUT_ANSWER
    });

    await desktopWindow.keyboard.press(undoShortcut());
    await expect.poll(() => collectState(desktopWindow)).toEqual({
      answer: ANSWER,
      body: BODY,
      persistedAnswer: ANSWER,
      selection: { from: CUT_FROM, to: CUT_TO }
    });
    await desktopWindow.keyboard.press(redoShortcut());
    await expect.poll(() => collectState(desktopWindow)).toMatchObject({ answer: CUT_ANSWER, body: BODY });

    const bodyEnd = BODY.length;
    await desktopWindow.evaluate((position) => window.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position), bodyEnd);
    await desktopWindow.keyboard.insertText(' body edit');
    await expect.poll(() => collectState(desktopWindow)).toMatchObject({ body: `${BODY} body edit`, answer: CUT_ANSWER });
    await desktopWindow.keyboard.press(undoShortcut());
    await expect.poll(() => collectState(desktopWindow)).toMatchObject({ body: BODY, answer: CUT_ANSWER });

    await desktopWindow.evaluate(({ from, to }) => window.__folioleDebug?.setEditorSelection?.('answer-editor', from, to), {
      from: CUT_FROM,
      to: CUT_FROM
    });
    await desktopWindow.keyboard.press(undoShortcut());
    await expect.poll(() => collectState(desktopWindow)).toMatchObject({ answer: ANSWER, body: BODY });
    await desktopWindow.screenshot({
      path: path.resolve('.tmp/artifacts/desktop-acceptance/darwin-t174-answer-cut-undo-hidden-native.png')
    });
  } finally {
    await restoreSystemClipboard(desktopApp);
  }
});
