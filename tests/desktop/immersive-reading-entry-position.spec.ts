import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { IMMERSIVE_READING_KEY } from './harness/immersiveReadingShortcut';
import { expectWorkspaceShell } from './harness/settings';

const paragraph = (index: number) => `Paragraph ${index} keeps the same reading position across layouts.`;

async function openLongTopic(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const content = Array.from({ length: 150 }, (_, index) => paragraph(index + 1)).join('\n\n');
  await page.evaluate(async (content) => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([{ id: 'immersive-entry-position', kind: 'topic', title: 'Long topic', content }], { persist: true });
    await api.openNode('immersive-entry-position');
  }, content);
  await expect(page.locator('.prompt-editor-host .cm-scroller')).toContainText(paragraph(1));
}

async function scrollAndReadAnchor(page: Page, delta = 2200) {
  const scroller = page.locator('.prompt-editor-host .cm-scroller');
  const previous = await scroller.evaluate((element) => element.scrollTop);
  await scroller.evaluate((element, deltaY) => {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY }));
    element.scrollTop += deltaY;
  }, delta);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(previous + delta / 2);
  const read = () => scroller.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const anchorY = viewport.top + viewport.height * 0.15;
    return [...element.querySelectorAll('.cm-line')]
      .map((line) => ({ text: line.textContent?.trim(), rect: line.getBoundingClientRect() }))
      .filter(({ rect, text }) => text && rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((left, right) =>
        Math.abs((left.rect.top + left.rect.bottom) / 2 - anchorY) -
        Math.abs((right.rect.top + right.rect.bottom) / 2 - anchorY)
      )[0]?.text;
  });
  let text: string | undefined;
  await expect.poll(async () => {
    text = await read();
    return text;
  }).toMatch(/^Paragraph [1-9]\d+ /);
  return text!;
}

async function clickNativeMenu(session: DesktopSession) {
  await session.electronApp.evaluate(({ BrowserWindow, Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('editor.toggleImmersiveMode');
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!item?.enabled || !window) throw new Error('Immersive Reading menu command unavailable');
    item.click(undefined, window, window.webContents);
  });
}

for (const entry of ['keyboard', 'rail', 'palette', 'native menu'] as const) {
  test(`keeps the visible paragraph marked when entering from the ${entry}`, async ({ desktopWindow: page, desktopSession }) => {
    await openLongTopic(page);
    const before = await scrollAndReadAnchor(page);
    expect(before).toMatch(/^Paragraph [1-9]\d+ /);

    if (entry === 'rail') {
      await page.getByRole('button', { name: /^(Reading Mode|阅读模式)$/ }).click();
    } else if (entry === 'palette') {
      await page.getByRole('button', { name: /^(Command Palette|命令面板)$/ }).click();
      await page.getByText(/^(Enter Immersive Reading|进入沉浸阅读)$/).click();
    } else if (entry === 'native menu') {
      await clickNativeMenu(desktopSession);
    } else {
      await page.keyboard.press(IMMERSIVE_READING_KEY);
    }

    const list = page.locator('[data-workspace-side-column="list"]');
    const marker = page.locator('.prompt-editor-host .cm-paragraph-marker-line').filter({ hasText: before! });
    await expect(list).toHaveCount(0);
    await expect(marker).toBeInViewport();
    await page.waitForFunction(() => window.__folioleDebug?.getTraces().some((trace) =>
      trace.event === 'runtime.reading-position.applying-complete' &&
      (trace.payload as { selection?: { from: number } }).selection?.from));

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const beforeExit = await page.locator('.cm-paragraph-marker-line').first().textContent();
    expect(beforeExit?.trim()).not.toBe(before);
    await page.keyboard.press(entry === 'keyboard' ? IMMERSIVE_READING_KEY : 'Escape');
    await expect(list).toBeVisible();
    expect(await page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe('immersive-entry-position');
    await expect(page.getByText(beforeExit!.trim(), { exact: true })).toBeInViewport();
    await expect(page.locator('.prompt-editor-host .cm-paragraph-marker-line')).toHaveCount(0);
  });
}

test('keeps the latest paragraph after switching layouts twice and entering again', async ({ desktopWindow: page }) => {
  await openLongTopic(page);
  const before = await scrollAndReadAnchor(page);
  expect(before).toMatch(/^Paragraph [1-9]\d+ /);
  const list = page.locator('[data-workspace-side-column="list"]');

  await page.keyboard.press(IMMERSIVE_READING_KEY);
  await expect(list).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(list).toBeVisible();
  await page.keyboard.press(IMMERSIVE_READING_KEY);
  await expect(list).toHaveCount(0);
  await expect(page.locator('.cm-paragraph-marker-line').filter({ hasText: before! })).toBeInViewport();

  await page.keyboard.press('ArrowDown');
  const next = paragraph(Number(before!.match(/^Paragraph (\d+)/)?.[1]) + 1);
  await expect(page.locator('.cm-paragraph-marker-line').filter({ hasText: next })).toBeInViewport();
});

test('persists an edit made immediately before exiting immersive reading', async ({ desktopWindow: page }) => {
  await openLongTopic(page);
  const before = await scrollAndReadAnchor(page);
  expect(before).toMatch(/^Paragraph [1-9]\d+ /);

  await page.getByRole('button', { name: /^(Reading Mode|阅读模式)$/ }).click();
  const marker = page.locator('.prompt-editor-host .cm-paragraph-marker-line').filter({ hasText: before! });
  await expect(marker).toBeInViewport();
  await page.keyboard.press('Enter');
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeFocused();

  const edit = 'Draft kept through the transition. ';
  await page.keyboard.insertText(edit);
  await page.keyboard.press(IMMERSIVE_READING_KEY);
  await expect(page.locator('[data-workspace-side-column="list"]')).toBeVisible();
  await expect(editor).toContainText(edit.trim());
  await expect.poll(() => page.evaluate(async () =>
    (await window.electronAPI.invoke('load_node_document', { nodeId: 'immersive-entry-position' }))?.content
  )).toContain(edit.trim());
});


test('keeps the same material and queue cursor when toggling immersive reading in Flow', async ({
  desktopApp, desktopWindow: page
}) => {
  await openLongTopic(page);
  await page.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'item' || (node.kind === 'topic' && node.id !== 'immersive-entry-position')) {
        await api.deleteNode(node.id);
      }
    }
  });
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click();
  const read = page.getByRole('button', { name: /^Read$/ });
  await expect(read).toBeEnabled();
  const reviewSession = () => page.evaluate(() => window.__folioleWorkspaceDebug?.getReviewSession());
  const before = await reviewSession();
  expect(before?.currentNodeId).toBeTruthy();
  await page.keyboard.press(IMMERSIVE_READING_KEY);
  const marker = page.locator('.cm-paragraph-marker-line').first();
  await expect(marker).toBeInViewport();
  const markedParagraph = (await marker.textContent())?.trim();
  expect(markedParagraph).toBeTruthy();
  expect(await reviewSession()).toEqual(before);

  await page.keyboard.press('Escape');
  await expect(read).toBeEnabled();
  await expect(page.locator('.prompt-editor-host .cm-line').filter({ hasText: markedParagraph! }).first()).toBeInViewport();
  expect(await reviewSession()).toEqual(before);
});
