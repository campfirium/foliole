import path from 'node:path';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import {
  CONTEXT_A_CONTENT, CONTEXT_A_ID, focusEditor, focusWorkspace, insertEditorText,
  redoShortcut, seedContextualHistoryWorkspace, undoShortcut
} from './harness/contextualContentHistory';
import {
  clickNativeHistoryCommand, createStructureTopic, readStructureHistory, seedStructureWorkspace
} from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

type Surface = 'feedback' | 'settings' | 'search';
type HistoryAction = (mode: 'undo' | 'redo') => Promise<void>;
const INPUT_TEXT = 'Local history input';
const BODY_EDIT = '\nPersisted body edit';
const OUTPUT = path.resolve('.tmp/artifacts/command-text-history');

async function prepareWorkspace(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
}

async function readProtectedState(page: Page, nodeId: string) {
  return page.evaluate(async (id) => {
    const debug = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const document = await window.electronAPI.invoke('load_node_document', { nodeId: id });
    const node = debug.getNode(id);
    return {
      content: node?.content,
      trashed: node?.trashed,
      diskContent: document?.content,
      diskTrashed: snapshot.trashedNodeIds.includes(id),
      structure: debug.getWorkspaceStructureHistory?.(),
      contentHistory: debug.getEditorOperationHistory?.()
    };
  }, nodeId);
}

async function openInput(page: Page, surface: Surface) {
  if (surface === 'feedback') {
    await page.getByRole('button', { name: 'Send Feedback', exact: true }).click();
    return page.getByRole('textbox', { name: 'Feedback', exact: true });
  }
  if (surface === 'settings') {
    const dialog = await openSettingsCategory(page, 'Hotkeys');
    return dialog.getByRole('searchbox', { name: 'Search hotkeys' });
  }
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+F' : 'Control+K');
  const dialog = page.getByRole('dialog', { name: 'Workspace search' });
  const prompt = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: 'Not now', exact: true })
  });
  await expect.poll(async () => await dialog.isVisible() || await prompt.isVisible()).toBe(true);
  if (await prompt.isVisible()) await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(dialog).toBeVisible();
  return dialog.getByRole('textbox', { name: 'Search workspace' });
}

function keyboardHistory(page: Page): HistoryAction {
  return (mode) => page.keyboard.press(mode === 'undo' ? undoShortcut() : redoShortcut());
}

async function verifyInputHistory(args: {
  page: Page; input: Locator; nodeId: string; run: HistoryAction; label: string;
}) {
  const { page, input, nodeId, run, label } = args;
  await input.click();
  await page.keyboard.type(INPUT_TEXT);
  await expect(input).toHaveValue(INPUT_TEXT);
  const before = await readProtectedState(page, nodeId);
  await run('undo');
  await expect(input).not.toHaveValue(INPUT_TEXT);
  await expect(input).toBeFocused();
  await expect.poll(() => readProtectedState(page, nodeId)).toEqual(before);
  await page.screenshot({ path: path.join(OUTPUT, `${label}-undo.png`) });
  await run('redo');
  await expect(input).toHaveValue(INPUT_TEXT);
  await expect.poll(() => readProtectedState(page, nodeId)).toEqual(before);
  await page.screenshot({ path: path.join(OUTPUT, `${label}-redo.png`) });
  return before;
}

async function prepareStructureHistory(page: Page) {
  await prepareWorkspace(page);
  await seedStructureWorkspace(page);
  const id = await createStructureTopic(page);
  await expect.poll(() => readStructureHistory(page)).toMatchObject({
    undoStack: [{ type: 'structure.create' }]
  });
  await expect.poll(async () => (await readProtectedState(page, id)).diskTrashed).toBe(false);
  await focusWorkspace(page);
  return id;
}

for (const surface of ['feedback', 'settings', 'search'] as const) {
  test(`keeps workspace history unchanged while undoing text in ${surface}`, async ({ desktopWindow: page }) => {
    const nodeId = await prepareStructureHistory(page);
    const input = await openInput(page, surface);
    await verifyInputHistory({ page, input, nodeId, run: keyboardHistory(page), label: `workspace-${surface}` });
  });
}

test('preserves persisted content when feedback text uses undo and redo', async ({ desktopApp, desktopWindow: page }) => {
  await prepareWorkspace(page);
  await seedContextualHistoryWorkspace(page);
  await insertEditorText(page, BODY_EDIT);
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content)
    .toBe(CONTEXT_A_CONTENT + BODY_EDIT);
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(CONTEXT_A_CONTENT);
  await page.keyboard.press(redoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content)
    .toBe(CONTEXT_A_CONTENT + BODY_EDIT);
  await clickNativeHistoryCommand(desktopApp, page, 'app.undo');
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(CONTEXT_A_CONTENT);
  await clickNativeHistoryCommand(desktopApp, page, 'app.redo');
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content)
    .toBe(CONTEXT_A_CONTENT + BODY_EDIT);
  const input = await openInput(page, 'feedback');
  await verifyInputHistory({
    page, input, nodeId: CONTEXT_A_ID, run: keyboardHistory(page), label: 'content-feedback'
  });
});

async function drainTextHistory(input: Locator, run: HistoryAction, mode: 'undo' | 'redo') {
  for (let attempts = 0; attempts <= INPUT_TEXT.length; attempts += 1) {
    if (!await input.evaluate((_element, command) => document.queryCommandEnabled(command), mode)) return;
    const before = await input.inputValue();
    await run(mode);
    await expect(input).not.toHaveValue(before);
  }
  throw new Error(`Text ${mode} history did not drain within the typed character count`);
}

function nativeHistory(app: ElectronApplication, page: Page): HistoryAction {
  // Invoke the installed menu callback, not a physical menu-bar click or keyboard accelerator.
  return async (mode) => {
    const command = mode === 'undo' ? 'app.undo' : 'app.redo';
    await page.evaluate((expected) => {
      const target = window as typeof window & { textHistoryMenuReceived?: Promise<void> };
      target.textHistoryMenuReceived = new Promise<void>((resolve) => {
        const unlisten = window.electronAPI.onNativeMenuCommand((id) => {
          if (id !== expected) return;
          unlisten();
          resolve();
        });
      });
    }, command);
    await clickNativeHistoryCommand(app, page, command);
    await page.evaluate(async () => {
      const target = window as typeof window & { textHistoryMenuReceived?: Promise<void> };
      await target.textHistoryMenuReceived;
      delete target.textHistoryMenuReceived;
    });
  };
}

test('native history commands stay in feedback text even when its history is empty', async ({ desktopApp, desktopWindow: page }) => {
  const nodeId = await prepareStructureHistory(page);
  const input = await openInput(page, 'feedback');
  const run = nativeHistory(desktopApp, page);
  const before = await verifyInputHistory({ page, input, nodeId, run, label: 'native-feedback' });
  for (const mode of ['undo', 'redo'] as const) {
    await drainTextHistory(input, run, mode);
    expect(await input.evaluate((_element, command) => document.queryCommandEnabled(command), mode)).toBe(false);
    const text = await input.inputValue();
    await run(mode);
    await expect(input).toHaveValue(text);
    await expect(input).toBeFocused();
    await expect.poll(() => readProtectedState(page, nodeId)).toEqual(before);
  }
  await page.screenshot({ path: path.join(OUTPUT, 'native-empty-history.png') });
});
