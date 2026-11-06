import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const toggleFor = (page: Page, side: string) => page.locator(`[data-workspace-sidebar-toggle="${side}"]:visible`).first();
const columnFor = (page: Page, side: string) => page.locator(`[data-workspace-side-column="${side === 'left' ? 'list' : 'right'}"]`);

async function prepare(page: Page, width: number) {
  await page.evaluate(() => window.localStorage.setItem('foliole-command-shortcut-overrides', JSON.stringify({
    'workspace.toggleList': { primary: 'Alt+[' },
    'workspace.toggleRightSidebar': { primary: 'Alt+]' }
  })));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.setViewportSize({ width, height: 900 });
}

async function expectNoHiddenFocus(page: Page) {
  const badFocus = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return false;
    return Boolean(active.closest('[inert], [aria-hidden="true"], [hidden]'))
      || active.getBoundingClientRect().width === 0 || active.getBoundingClientRect().height === 0;
  });
  expect(badFocus).toBe(false);
}

async function tabIntoSidebar(page: Page, side: string) {
  const column = columnFor(page, side);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await column.evaluate(element => element.contains(document.activeElement))) return;
  }
  throw new Error(`opened ${side} sidebar cannot be reached with Tab`);
}

async function resizeOpenSidebar(page: Page, side: string) {
  const splitter = page.getByRole('separator', {
    name: side === 'left' ? /^(Resize topic list|调整主题列表宽度)$/ : /^(Resize inspector sidebar|调整检查器侧栏宽度)$/
  });
  const original = await splitter.getAttribute('aria-valuenow');
  await splitter.focus();
  await page.keyboard.press(side === 'left' ? 'ArrowRight' : 'ArrowLeft');
  await expect(splitter).not.toHaveAttribute('aria-valuenow', original!);
  const afterKey = await splitter.getAttribute('aria-valuenow');
  const bounds = await splitter.boundingBox();
  if (!bounds) throw new Error('visible splitter bounds missing');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 24, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await expect(splitter).not.toHaveAttribute('aria-valuenow', afterKey!);
}

for (const width of [1600, 1000]) {
  test(`closed sidebars skip keyboard focus and reopen at ${width}px`, async ({ desktopWindow: page }) => {
    await prepare(page, width);
    for (const side of ['left', 'right']) {
      const toggle = toggleFor(page, side);
      const column = columnFor(page, side);
      const shortcut = side === 'left' ? 'Alt+[' : 'Alt+]';
      if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
      if (width === 1600) await resizeOpenSidebar(page, side);
      const expandedWidth = (await column.boundingBox())?.width;
      const internal = column.locator('button:visible, input:visible, [tabindex="0"]:visible').first();
      await expect(internal).toBeVisible();
      await internal.focus();
      await expect(internal).toBeFocused();
      await page.keyboard.press(shortcut);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect((await column.boundingBox())?.width).toBe(expandedWidth);
      await tabIntoSidebar(page, side);
      await internal.focus();
      await expect(internal).toBeFocused();
      if (width === 1000) {
        await page.keyboard.press('Escape');
        await expect(toggle).toBeFocused();
      } else {
        await toggle.click();
        await expect(toggle).toBeFocused();
      }
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    }
    const editor = page.getByRole('textbox', { name: 'Prompt editor', exact: true });
    await editor.focus();
    for (const shortcut of ['Alt+[', 'Alt+]', 'Alt+[', 'Alt+]']) {
      await page.keyboard.press(shortcut);
      await expect(editor).toBeFocused();
    }
    if (width === 1000) {
      await toggleFor(page, 'right').focus();
      await page.keyboard.press('Escape');
    }
    for (const side of ['left', 'right']) await expect(toggleFor(page, side)).toHaveAttribute('aria-pressed', 'false');
    for (const key of ['Tab', 'Shift+Tab']) {
      await editor.focus();
      for (let index = 0; index < 35; index += 1) {
        await page.keyboard.press(key);
        await expectNoHiddenFocus(page);
      }
    }
    await page.screenshot({ path: `.tmp/artifacts/T732-4/closed-${width}.png` });
    await toggleFor(page, 'right').click();
    await columnFor(page, 'right').locator('button:visible').first().focus();
    await page.setViewportSize({ width: width === 1600 ? 1000 : 1600, height: 900 });
    await expectNoHiddenFocus(page);
    await page.screenshot({ path: `.tmp/artifacts/T732-4/breakpoint-from-${width}.png` });
  });
}

test('immersion hands sidebar focus to the document and preserves reopening', async ({ desktopWindow: page }) => {
  await prepare(page, 1600);
  for (const side of ['left', 'right']) {
    const toggle = toggleFor(page, side);
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
    const internal = columnFor(page, side).locator('button:visible').first();
    await internal.focus();
    await page.keyboard.press('F11');
    await expect(page.locator('[data-workspace-document-focus-target]')).toBeFocused();
    await page.keyboard.press('F11');
    await expect(internal).toBeVisible();
    await internal.focus();
    await expect(internal).toBeFocused();
  }
  await page.screenshot({ path: '.tmp/artifacts/T732-4/immersion-return.png' });
});
