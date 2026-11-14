import type { ElectronApplication, Page } from '@playwright/test';

import { collectActiveEditorState, CONTEXT_A_CONTENT, CONTEXT_A_ID, seedContextualHistoryWorkspace } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

function readAccelerator(app: ElectronApplication, commandId: string) {
  return app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator, commandId);
}

async function select(page: Page, from: number, to = from) {
  expect(await page.evaluate(([anchor, head]) =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', anchor, head), [from, to])).toBe(true);
}

async function expectContent(page: Page, content: string) {
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({
    editorContent: content,
    nodeContent: content
  });
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(content);
}

async function exerciseShortcut(page: Page, key: string, first: string, second: string, shift = false) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  if (shift) await page.keyboard.down('Shift');
  try {
    await page.keyboard.down(key);
    await expectContent(page, first);
    await page.keyboard.down(key);
    await page.keyboard.up(key);
    await expectContent(page, first);
    await page.keyboard.press(key);
    await expectContent(page, second);
  } finally {
    await page.keyboard.up(key);
    if (shift) await page.keyboard.up('Shift');
    await page.keyboard.up(modifier);
  }
}

async function prepareEditor(page: Page, customized = false) {
  if (customized) {
    await page.evaluate((metaKey) => localStorage.setItem('foliole-command-shortcut-overrides', JSON.stringify({
      'app.undo': { primary: metaKey ? 'Cmd+U' : 'Ctrl+U' },
      'app.redo': { primary: metaKey ? 'Cmd+R' : 'Ctrl+R' }
    })), process.platform === 'darwin');
    await page.reload();
  }
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await seedContextualHistoryWorkspace(page);
  await page.locator('.prompt-editor-host .cm-content').click();
}

test('cut removes the selection once and cuts the current line on a fresh press', async ({
  desktopWindow: page
}) => {
  await prepareEditor(page);
  await select(page, 0, 2);
  await exerciseShortcut(page, 'X', CONTEXT_A_CONTENT.slice(2), '\nBase A');
});

for (const customized of [false, true]) {
  test(`undo and redo each take one step per press with the ${customized ? 'customized' : 'default'} shortcut`, async ({
    desktopApp, desktopWindow: page
  }) => {
    await prepareEditor(page, customized);
    await expect.poll(() => readAccelerator(desktopApp, 'app.undo')).toBe(
      `${process.platform === 'darwin' ? 'Command' : 'Control'}+${customized ? 'U' : 'Z'}`
    );
    const modifier = process.platform === 'darwin' ? 'Command' : 'Control';
    await expect.poll(() => readAccelerator(desktopApp, 'app.redo')).toBe(
      `${modifier}+${customized ? 'R' : 'Shift+Z'}`
    );
    await select(page, CONTEXT_A_CONTENT.length);
    await page.keyboard.insertText(' first');
    await expectContent(page, CONTEXT_A_CONTENT + ' first');
    await select(page, 2);
    await page.keyboard.insertText('second ');
    await expectContent(page, '# second Context A\n\nBase A first');
    await exerciseShortcut(page, customized ? 'U' : 'Z', CONTEXT_A_CONTENT + ' first', CONTEXT_A_CONTENT);
    await exerciseShortcut(page, customized ? 'R' : 'Z', CONTEXT_A_CONTENT + ' first', '# second Context A\n\nBase A first', !customized);
  });
}
