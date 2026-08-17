import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { expect, type ElectronApplication, type Page } from '@playwright/test';

export const CONTEXT_A_ID = 'playwright-content-history-a';
export const CONTEXT_B_ID = 'playwright-content-history-b';
export const EMPTY_CONTEXT_ID = 'playwright-content-history-empty';
export const WORKSPACE_TARGET_ID = 'playwright-content-history-workspace-target';
export const CONTEXT_A_CONTENT = '# Context A\n\nBase A';
export const CONTEXT_B_CONTENT = '# Context B\n\nBase B';
export const PDF_HIGHLIGHT_TEXT = 'gamma keyword';

const PDF_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'pdf-user-journey.pdf'
);

export function undoShortcut() {
  return process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z';
}

export function redoShortcut() {
  return process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y';
}

export async function seedContextualHistoryWorkspace(page: Page) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async (seeds) => window.__folioleWorkspaceDebug?.seedNodes?.(seeds), [
    { content: CONTEXT_A_CONTENT, id: CONTEXT_A_ID, kind: 'topic', title: 'Context A' },
    { content: CONTEXT_B_CONTENT, id: CONTEXT_B_ID, kind: 'topic', title: 'Context B' },
    { content: '# Empty context', id: EMPTY_CONTEXT_ID, kind: 'topic', title: 'Empty Context' },
    { content: '# Workspace target', id: WORKSPACE_TARGET_ID, kind: 'topic', title: 'Workspace Target' }
  ]);
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toEqual({
    activeNodeId: CONTEXT_A_ID,
    editorContent: CONTEXT_A_CONTENT,
    nodeContent: CONTEXT_A_CONTENT
  });
}

export async function collectActiveEditorState(page: Page, nodeId: string) {
  return page.evaluate((targetNodeId) => ({
    activeNodeId: window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
    editorContent: window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null,
    nodeContent: window.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.content ?? null
  }), nodeId);
}

export async function collectNode(page: Page, nodeId: string) {
  return page.evaluate((targetNodeId) => window.__folioleWorkspaceDebug?.getNode?.(targetNodeId) ?? null, nodeId);
}

export async function openNode(page: Page, nodeId: string) {
  await expect.poll(() => page.evaluate(
    (targetNodeId) => window.__folioleWorkspaceDebug?.openNode?.(targetNodeId) ?? false,
    nodeId
  )).toBe(true);
  await expect.poll(() => page.evaluate(
    () => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  )).toBe(nodeId);
}

export async function openPdfNode(page: Page, nodeId: string) {
  const pageInput = page.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await expect(async () => {
    await openNode(page, nodeId);
    await expect(pageInput).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return pageInput;
}

export async function insertEditorText(page: Page, text: string) {
  const position = await page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')?.length ?? -1);
  await expect.poll(() => page.evaluate(
    (nextPosition) => window.__folioleDebug?.setEditorSelection?.('prompt-editor', nextPosition, nextPosition) ?? false,
    position
  )).toBe(true);
  const editor = page.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await page.keyboard.insertText(text);
}

export async function focusEditor(page: Page) {
  await page.locator('.prompt-editor-host .cm-content').click();
}

export async function focusWorkspace(page: Page) {
  await page.locator('[data-undo-history-owner="workspace"]').first().click({ position: { x: 4, y: 4 } });
}

export async function importPdfThroughRuntime(app: ElectronApplication, page: Page) {
  await app.evaluate(({ dialog }, fixturePath) => {
    const target = globalThis as typeof globalThis & { originalShowOpenDialog?: typeof dialog.showOpenDialog };
    target.originalShowOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  }, PDF_FIXTURE_PATH);
  try {
    const result = await page.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
    if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
      throw new Error(`PDF import did not create a node: ${JSON.stringify(result)}`);
    }
    return result.node_id;
  } finally {
    await app.evaluate(({ dialog }) => {
      const target = globalThis as typeof globalThis & { originalShowOpenDialog?: typeof dialog.showOpenDialog };
      if (target.originalShowOpenDialog) dialog.showOpenDialog = target.originalShowOpenDialog;
      delete target.originalShowOpenDialog;
    });
  }
}

export async function selectPdfHighlightText(page: Page) {
  const selected = await page.evaluate((text) => {
    const surface = document.querySelector<HTMLElement>('[data-testid="pdf-document-surface"]');
    const walker = surface ? document.createTreeWalker(surface, NodeFilter.SHOW_TEXT) : null;
    let textNode = walker?.nextNode() ?? null;
    while (textNode && !textNode.textContent?.includes(text)) textNode = walker?.nextNode() ?? null;
    const start = textNode?.textContent?.indexOf(text) ?? -1;
    if (!textNode || start < 0) return false;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + text.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    const rect = range.getBoundingClientRect();
    textNode.parentElement?.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: rect.right, clientY: rect.bottom
    }));
    return true;
  }, PDF_HIGHLIGHT_TEXT);
  expect(selected).toBe(true);
}
