import process from 'node:process';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { IMMERSIVE_READING_KEY } from './harness/immersiveReadingShortcut';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const TEXT = '使用Foliole阅读2026年';
const NODE = 'mixed-script-selection';

async function preserveClipboard(app: ElectronApplication) {
  await app.evaluate(async ({ clipboard }) => {
    const root = globalThis as typeof globalThis & { autospaceClipboard?: Record<string, Blob>[] };
    root.autospaceClipboard = await Promise.all((await clipboard.read()).map(async (item) =>
      Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await item.getType(type)])))
    ));
  });
}

async function restoreClipboard(app: ElectronApplication) {
  await app.evaluate(async ({ ClipboardItem, clipboard }) => {
    const root = globalThis as typeof globalThis & { autospaceClipboard?: Record<string, Blob>[] };
    if (!root.autospaceClipboard) throw new Error('Clipboard backup missing');
    if (root.autospaceClipboard.length) await clipboard.write(root.autospaceClipboard.map((payload) => new ClipboardItem(payload)));
    else clipboard.clear();
    delete root.autospaceClipboard;
  });
}

async function selectMixedParagraph(page: Page) {
  const points = await page.locator('.prompt-editor-host .cm-line').first().evaluate((line) => {
    const node = line.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0); range.setEnd(node, 1);
    const start = range.getBoundingClientRect();
    range.selectNodeContents(line);
    return { x: start.left + 1, end: range.getBoundingClientRect().right + 2, y: start.top + start.height / 2 };
  });
  await page.mouse.move(points.x, points.y);
  await page.mouse.down();
  await page.mouse.move(points.end, points.y, { steps: 8 });
  await page.mouse.up();
}

async function expectBoundaryHitTesting(page: Page, content: string) {
  for (const offset of [2, 9]) {
    const point = await page.locator('.prompt-editor-host .cm-line').first().evaluate((line, index) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let remaining = index;
      while (node && remaining >= (node.textContent?.length ?? 0)) {
        remaining -= node.textContent?.length ?? 0;
        node = walker.nextNode();
      }
      if (!node) throw new Error('Visible text position missing');
      const range = document.createRange();
      range.setStart(node, remaining); range.setEnd(node, remaining + 1);
      const box = range.getBoundingClientRect();
      const bounds = line.getBoundingClientRect();
      return { x: box.left - bounds.left + 1, y: box.top - bounds.top + box.height / 2 };
    }, offset);
    await page.locator('.prompt-editor-host .cm-line').first().click({ position: point });
    await expect.poll(() => page.evaluate(() => window.__folioleDebug.getEditorSelection('prompt-editor')))
      .toEqual({ from: content.indexOf(offset === 2 ? 'Foliole' : '阅读'), to: content.indexOf(offset === 2 ? 'Foliole' : '阅读') });
  }
}

for (const [variant, content] of [['plain', TEXT], ['bold', '使用**Foliole**阅读2026年']] as const) {
  test(`copies original ${variant} mixed-script text and preserves its highlight through reflow`, async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ content, id }) => {
    await window.__folioleWorkspaceDebug!.seedNodes([{ content, id, kind: 'topic', title: 'Mixed-script selection' }], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode(id);
  }, { content, id: NODE });
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toHaveText(TEXT);
  await desktopWindow.keyboard.press(IMMERSIVE_READING_KEY);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toHaveAttribute('aria-readonly', 'true');
  await preserveClipboard(desktopApp);
  try {
    await expectBoundaryHitTesting(desktopWindow, content);
    await selectMixedParagraph(desktopWindow);
    await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug.getEditorSelection('prompt-editor')))
      .toEqual({ from: 0, to: content.length });
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(content);
    await desktopWindow.locator('[data-annotation-toolbar="true"]').getByRole('button', { name: /^(Highlight|高亮)$/ }).click();
    await expect.poll(() => desktopWindow.evaluate((id) => {
      const api = window.__folioleWorkspaceDebug!;
      return api.listNodes().map((node) => api.getNode(node.id)).filter((node) => node?.parentNodeId === id
        && node.anchorLink?.kind === 'highlight').map((node) => node!.anchorLink!.locator);
    }, NODE)).toEqual([expect.objectContaining({ from: 0, to: content.length, originalText: content })]);
    await desktopWindow.keyboard.press(IMMERSIVE_READING_KEY);
    const dialog = await openSettingsCategory(desktopWindow, 'Typography');
    await dialog.getByLabel(/^(Interface font size|界面字号)$/).fill('23');
    await dialog.getByRole('button', { name: /^(Preview|预览)$/ }).click();
    await expect.poll(() => desktopWindow.locator('.prompt-editor-host .cm-md-highlight').evaluateAll((elements) => elements.map((element) => element.textContent).join(''))).toBe(TEXT);
    await expect(desktopWindow.locator('.prompt-editor-host .cm-line')).toHaveCSS('font-size', '23px');
    await desktopWindow.screenshot({ path: '.tmp/artifacts/T681/reading-autospace-highlight.png' });
  } finally {
    await restoreClipboard(desktopApp);
  }
});
}
