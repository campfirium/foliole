import process from 'node:process';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-t191-structured-list';
const BASE_CONTENT = '- parent\n- child\n\nplain';

type WindowPage = DesktopSession['firstWindow'];

async function setSelection(page: WindowPage, position: number) {
  await page.locator('.prompt-editor-host .cm-content').focus();
  await expect.poll(() => page.evaluate((target) =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', target, target) ?? false, position)).toBe(true);
}

async function getContent(page: WindowPage) {
  return page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null);
}

async function seedTopic(page: WindowPage, content: string) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async ({ content, nodeId }) => {
    const api = window.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content, id: nodeId, kind: 'topic', title: 'T191 structured list' }], { persist: true });
    await api?.openNode?.(nodeId);
  }, { content, nodeId: NODE_ID });
  await expect.poll(() => getContent(page)).toBe(content);
}

test('edits list structure, task state, and undo history without losing editor focus', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedTopic(desktopWindow, BASE_CONTENT);
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');

  await setSelection(desktopWindow, BASE_CONTENT.indexOf('- child') + '- child'.length);
  await desktopWindow.keyboard.press('Tab');
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n  - child\n\nplain');
  await expect(editor).toBeFocused();

  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n  - [ ] child\n\nplain');
  await setSelection(desktopWindow, (await getContent(desktopWindow))!.length);
  await desktopWindow.locator('.cm-md-task-checkbox').click();
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n  - [x] child\n\nplain');

  const undo = process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z';
  await desktopWindow.keyboard.press(undo);
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n  - [ ] child\n\nplain');
  await desktopWindow.keyboard.press(undo);
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n  - child\n\nplain');
  await desktopWindow.keyboard.press(undo);
  await expect.poll(() => getContent(desktopWindow)).toBe(BASE_CONTENT);

  const redo = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z';
  for (const expected of [
    '- parent\n  - child\n\nplain',
    '- parent\n  - [ ] child\n\nplain',
    '- parent\n  - [x] child\n\nplain'
  ]) {
    await desktopWindow.keyboard.press(redo);
    await expect.poll(() => getContent(desktopWindow)).toBe(expected);
  }
  expect(await desktopWindow.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  const saved = '- parent\n  - [x] child\n\nplain';
  await expect.poll(() => desktopWindow.evaluate(async (nodeId) =>
    (await window.electronAPI.invoke('load_node_document', { nodeId }))?.content, NODE_ID)).toBe(saved);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug!.openNode(nodeId), NODE_ID);
  await expect.poll(() => getContent(desktopWindow)).toBe(saved);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/desktop-acceptance/t191-restored-markdown.png' });
});

test('promotes then exits an empty nested list item one Enter at a time', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const nested = '- parent\n  - ';
  await seedTopic(desktopWindow, nested);
  await setSelection(desktopWindow, nested.length);

  await desktopWindow.keyboard.press('Enter');
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n- ');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toBeFocused();
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleDebug?.getEditorSelection?.('prompt-editor') ?? null)).toEqual({ from: 11, to: 11 });
  await desktopWindow.keyboard.press('Enter');
  await expect.poll(() => getContent(desktopWindow)).toBe('- parent\n');
});
