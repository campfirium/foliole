import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function focusStyle(button: Locator) {
  return button.evaluate(element => {
    const style = getComputedStyle(element);
    const shadows = style.boxShadow === 'none' ? [] : style.boxShadow.split(/,(?![^()]*\))/)
      .map(shadow => shadow.trim())
      .filter(shadow => !shadow.startsWith('rgba(0, 0, 0, 0)'));
    return { outline: style.outlineStyle, shadows, background: style.backgroundColor };
  });
}

async function hasFocusLine(button: Locator) {
  const { outline, shadows } = await focusStyle(button);
  return outline !== 'none' || shadows.length > 0;
}

test('returns focus after closing the workspace sort menu with the cue from its opening input', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const sort = page.getByRole('button', { name: /^(Sort list by |按.*排序列表$)/ }).first();
  const menu = page.getByRole('menu', { name: /^(Sort list by |按.*排序列表$)/ });
  const baseline = await focusStyle(sort);

  for (const navigateMenu of [false, true]) {
    await sort.click();
    await expect(menu).toBeVisible();
    await page.mouse.move(2, 2);
    if (navigateMenu) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(sort).toBeFocused();
    await expect.poll(() => focusStyle(sort)).toEqual(baseline);
    if (!navigateMenu) await page.screenshot({ path: '.tmp/artifacts/T792/menu-pointer-escape.png' });
  }

  await page.keyboard.press('Tab');
  await expect(sort).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sort).toBeFocused();
  await expect.poll(() => hasFocusLine(sort)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sort).toBeFocused();
  await page.screenshot({ path: '.tmp/artifacts/T792/menu-keyboard-escape.png' });
  await expect.poll(() => hasFocusLine(sort)).toBe(true);

  await sort.click();
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').first().click();
  await expect(menu).toBeHidden();
  await expect(sort).toBeFocused();
  await expect.poll(() => focusStyle(sort)).toEqual(baseline);

  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').first().click();
  await expect(menu).toBeHidden();
  await expect(sort).toBeFocused();
  await expect.poll(() => hasFocusLine(sort)).toBe(true);

  await sort.click();
  await expect(menu).toBeVisible();
  const outside = page.locator('[data-workspace-sidebar-toggle="right"]:visible').first();
  await outside.click();
  await expect(menu).toBeHidden();
  await expect(outside).toBeFocused();
});
