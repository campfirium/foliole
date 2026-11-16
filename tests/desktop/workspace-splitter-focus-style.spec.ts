import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory, setActiveSidebarTierDockedWidths } from './harness/settings';

async function tabTo(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) return;
  }
  throw new Error('The sidebar divider is unreachable by Tab');
}

async function focusEdge(divider: Locator) {
  return divider.evaluate(element => {
    const edge = getComputedStyle(element, '::after');
    return {
      visible: edge.content !== 'none' && edge.borderInlineStartStyle === 'solid',
      width: edge.borderInlineStartWidth,
      color: edge.borderInlineStartColor
    };
  });
}

for (const mode of ['dock', 'edge'] as const) {
  test(`the inspector divider shows a single keyboard focus edge in ${mode} mode`, async ({ desktopWindow: page }) => {
    await expectWorkspaceShell(page);
    await setActiveSidebarTierDockedWidths(page, 30, 30);
    const settings = await openSettingsCategory(page, 'Appearance');
    const theme = mode === 'dock' ? 'light' : 'dark';
    await settings.getByRole('radio', { name: theme === 'light' ? /^(Light|浅色)$/ : /^(Dark|深色)$/ }).click();
    if (mode === 'edge') {
      const row = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ }).locator('tr[aria-current="true"]');
      await row.getByRole('combobox', { name: /^(Right sidebar|右侧检查器)$/ }).selectOption('edge');
    }
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    if (mode === 'edge') {
      await page.mouse.move(page.viewportSize()!.width - 60, 400);
    }

    const container = mode === 'dock' ? page.locator('[data-workspace-tier-splitter="right"]')
      : page.locator('.workspace-floating-sidebar-right');
    const divider = container.getByRole('separator', { name: /^(Resize inspector sidebar|调整检查器侧栏宽度)$/ });
    await expect(divider).toBeVisible();
    await tabTo(page, divider);
    await page.screenshot({ path: `.tmp/artifacts/T792/${mode}-focused.png` });
    await expect(divider).toHaveCSS('outline-style', 'none');
    const edge = await focusEdge(divider);
    expect(edge).toEqual({
      visible: true,
      width: '1px',
      color: theme === 'light' ? 'rgb(112, 112, 112)' : 'rgb(163, 163, 163)'
    });
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await focusEdge(divider)).toMatchObject({ visible: true, width: '1px' });
    expect((await focusEdge(divider)).color).not.toBe(edge.color);
    await page.emulateMedia({ forcedColors: null });

    const widthBefore = await divider.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowLeft');
    await expect(divider).not.toHaveAttribute('aria-valuenow', widthBefore!);
    await page.keyboard.press('Tab');
    await expect(divider).not.toBeFocused();
    expect((await focusEdge(divider)).visible).toBe(false);
    await page.screenshot({ path: `.tmp/artifacts/T792/${mode}-unfocused.png` });
    await page.keyboard.press('Shift+Tab');
    await expect(divider).toBeFocused();
  });
}
