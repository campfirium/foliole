import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory, setActiveSidebarTierDockedWidths } from './harness/settings';

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 120; step += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) return;
  }
  throw new Error('Expected control could not be reached by Tab');
}

async function expectFocusLine(target: Locator) {
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS('outline-style', 'solid');
  await expect(target).toHaveCSS('outline-width', '1px');
  const { ring, dark } = await target.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      ring: style.getPropertyValue('--tw-ring-shadow').trim(),
      dark: document.documentElement.dataset.resolvedBaseColor === 'dark'
    };
  });
  expect(ring).toMatch(/^(|0 0 #0000)$/);
  await expect(target).toHaveCSS('outline-color', dark ? 'rgb(163, 163, 163)' : 'rgb(112, 112, 112)');
}

test('uses one focus cue through workspace navigation and settings', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await setActiveSidebarTierDockedWidths(page, 30, 30);
  const settingsButton = page.getByRole('button', { name: /^(Settings|设置)$/ }).first();
  await tabTo(page, settingsButton);
  await expectFocusLine(settingsButton);
  const sort = page.getByRole('button', { name: /^(Sort list by |按.*排序列表$)/ }).first();
  await tabTo(page, sort);
  await expectFocusLine(sort);
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: /^(Sort list by |按.*排序列表$)/ });
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  const focusedItem = menu.getByRole('menuitem').and(page.locator(':focus'));
  await expect(focusedItem).toBeFocused();
  await expect(focusedItem).toHaveCSS('outline-style', 'none');
  await expect(focusedItem).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  await expectFocusLine(sort);
  await page.screenshot({ path: '.tmp/artifacts/T792/workspace-sort-focus.png' });

  const tree = page.locator('[data-topic-editor-focus-tree="true"]').first();
  const activeRow = tree.getByRole('treeitem').and(page.locator('[tabindex="0"]'));
  await tabTo(page, activeRow);
  await expectFocusLine(activeRow);

  const divider = page.getByRole('separator', { name: /^(Resize inspector sidebar|调整检查器侧栏宽度)$/ });
  await tabTo(page, divider);
  await expect(divider).toHaveCSS('outline-style', 'none');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeFocused();
  await expect(editor).toBeEditable();
  await page.keyboard.insertText('Keyboard focus walkthrough');
  await expect(editor).toContainText('Keyboard focus walkthrough');
  await expect(editor).toHaveCSS('outline-style', 'none');
  await expect(page.locator('.prompt-editor-host .cm-editor')).toHaveCSS('outline-style', 'none');
  await page.screenshot({ path: '.tmp/artifacts/T792/workspace-editor-focus.png' });
  await page.keyboard.press('Escape');

  const settings = await openSettingsCategory(page, 'Appearance');
  const radio = settings.getByRole('radio', { name: /^(Dark|深色)$/ });
  await tabTo(page, radio);
  await expectFocusLine(radio);
  const row = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ }).locator('tr[aria-current="true"]');
  const field = row.getByRole('combobox', { name: /^(Right sidebar|右侧检查器)$/ });
  const normalBorder = await field.evaluate(element => getComputedStyle(element).borderTopColor);
  await tabTo(page, field);
  await expect(field).toHaveCSS('outline-style', 'none');
  await expect(field).not.toHaveCSS('border-top-color', normalBorder);
  await page.screenshot({ path: '.tmp/artifacts/T792/workspace-settings-focus.png' });
});
