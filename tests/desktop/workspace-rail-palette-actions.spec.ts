import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, setActiveSidebarTierDockedWidths } from './harness/settings';

async function dismissSearchEnhancementPrompt(desktopWindow: import('@playwright/test').Page) {
  const prompt = desktopWindow.getByRole('dialog', {
    name: /(Turn on search enhancement for languages without spaces|要为无空格语言开启搜索增强|使用中文、日文或韩文搜索)/
  });
  const searchDialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await expect(prompt.or(searchDialog)).toBeVisible();
  if (await prompt.isVisible()) {
    await prompt.getByRole('button', { name: /(Not now|暂不)/ }).click();
    return true;
  }
  return false;
}

async function expectPaletteInputNoFocusRing(input: Locator) {
  await expect
    .poll(() =>
      input.evaluate((element) => {
        element.focus({ preventScroll: true });
        const styles = window.getComputedStyle(element);
        return {
          active: document.activeElement === element,
          appearance: styles.getPropertyValue('appearance'),
          boxShadow: styles.boxShadow,
          outlineStyle: styles.outlineStyle,
          webkitAppearance: styles.getPropertyValue('-webkit-appearance')
        };
      })
    )
    .toMatchObject({
      appearance: 'none',
      boxShadow: 'none',
      outlineStyle: 'none'
    });
}

async function expectRailButtonsSuppressAccentFocusRing(ribbon: Locator) {
  const buttons = ribbon.getByRole('button');
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const button of await buttons.all()) {
    await button.focus();
    await expect(button).toHaveCSS('outline-style', 'none');
    const shadows = await button.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(shadows === 'none' || shadows.split(/,(?![^()]*\))/).every(
      (shadow) => shadow.trim().startsWith('rgba(0, 0, 0, 0)')
    )).toBe(true);
  }
}

test('workspace rail opens search and command palette panels', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const ribbon = desktopWindow.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  await expectRailButtonsSuppressAccentFocusRing(ribbon);

  await testInfo.attach('workspace-rail-palette-actions', {
    body: await ribbon.screenshot(),
    contentType: 'image/png'
  });

  const searchButton = ribbon.getByRole('button', { name: /Search|搜索/ });
  await searchButton.click();
  await dismissSearchEnhancementPrompt(desktopWindow);
  const searchDialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await expect(searchDialog).toBeVisible();
  await expectPaletteInputNoFocusRing(searchDialog.getByRole('textbox', { name: /Search workspace|搜索工作区/ }));
  await testInfo.attach('search-palette-focus-ring-suppressed', {
    body: await searchDialog.screenshot(),
    contentType: 'image/png'
  });
  await desktopWindow.keyboard.press('Escape');
  await expect(searchDialog).toBeHidden();

  await ribbon.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const commandDialog = desktopWindow.getByRole('dialog', { name: /(Command palette|命令面板)/ });
  await expect(commandDialog).toBeVisible();
  const commandInput = commandDialog.getByRole('textbox', { name: /Search commands|搜索命令/ });
  await expect(commandInput).toHaveAttribute('autocomplete', 'off');
  await expect(commandInput).toHaveAttribute('data-1p-ignore', 'true');
  await expect(commandInput).toHaveAttribute('data-bwignore', 'true');
  await expect(commandInput).toHaveAttribute('data-lpignore', 'true');
  await expectPaletteInputNoFocusRing(commandInput);
  await expect(commandDialog.getByText(/desktop\.command\./)).toHaveCount(0);
  await expect(commandDialog.getByText(/desktop\.command\.section\./)).toHaveCount(0);
  await expect(commandDialog.getByRole('button', { name: /^(Command Palette|命令面板)$/ })).toBeVisible();

  await testInfo.attach('command-palette-autofill-suppression', {
    body: await commandDialog.screenshot(),
    contentType: 'image/png'
  });
});

async function expectPanelFitsAboveWorkspaceCenter(panel: Locator, widthLimit: number) {
  const position = await panel.evaluate((surface, widthLimit) => {
    const column = document.querySelector('[data-workspace-document-focus-target]')!.getBoundingClientRect();
    const bounds = surface.getBoundingClientRect();
    const width = Math.min(widthLimit, innerWidth - 32);
    const center = Math.min(innerWidth - 16 - width / 2, Math.max(16 + width / 2, column.x + column.width / 2));
    return {
      widthError: Math.abs(bounds.width - width),
      centerError: Math.abs(bounds.x + bounds.width / 2 - center),
      topError: Math.abs(bounds.top - (column.top + Math.min(88, Math.max(40, column.height * 0.08)))),
      bottomMargin: innerHeight - bounds.bottom
    };
  }, widthLimit);
  expect(position.widthError).toBeLessThan(1);
  expect(position.centerError).toBeLessThan(1);
  expect(position.topError).toBeLessThan(1);
  expect(position.bottomMargin).toBeGreaterThanOrEqual(15);
}

test('workspace palettes share the main column alignment and fit a short narrow window', async ({
  desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await setActiveSidebarTierDockedWidths(page, 40, 18);
  const rail = page.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  await rail.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  await dismissSearchEnhancementPrompt(page);
  const search = page.getByRole('dialog', { name: /Workspace search|工作区搜索/ });
  const searchPanel = search.getByRole('textbox').locator('../..');
  await expect(searchPanel).toBeVisible();
  await expectPanelFitsAboveWorkspaceCenter(searchPanel, 764);
  const searchHeight = (await searchPanel.boundingBox())!.height;
  await page.keyboard.press('Escape');

  await rail.getByRole('button', { name: /^(History|历史面板)$/ }).click();
  const history = page.getByRole('dialog', { name: /^(History|历史面板)$/ });
  const historyPanel = history.getByRole('searchbox').locator('../..');
  await expect(historyPanel).toBeVisible();
  await expectPanelFitsAboveWorkspaceCenter(historyPanel, 764);
  expect((await historyPanel.boundingBox())!.height).toBeCloseTo(searchHeight, 0);
  await testInfo.attach('history-aligned', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');

  await rail.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const command = page.getByRole('dialog', { name: /Command palette|命令面板/i });
  const input = command.getByRole('textbox');
  const panel = input.locator('../..');
  await expect(panel).toBeVisible();
  await expectPanelFitsAboveWorkspaceCenter(panel, 764);

  expect((await panel.boundingBox())!.height).toBeCloseTo(searchHeight, 0);

  await page.setViewportSize({ width: 700, height: 440 });
  await expectPanelFitsAboveWorkspaceCenter(panel, 764);
  const list = command.getByRole('list');
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const before = (await panel.boundingBox())!;
  await input.fill('zzzzzzzzzz');
  await expect(command.getByRole('listitem')).toHaveCount(1);
  const filtered = (await panel.boundingBox())!;
  expect(filtered.y).toBeCloseTo(before.y, 0);
  expect(filtered.height).toBeCloseTo(before.height, 0);
  await testInfo.attach('command-narrow-empty', { body: await page.screenshot(), contentType: 'image/png' });
  await page.mouse.click(5, 5);
  await expect(command).toBeHidden();

  await rail.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  await expect(searchPanel).toBeVisible();
  await expectPanelFitsAboveWorkspaceCenter(searchPanel, 764);
  await testInfo.attach('search-narrow', { body: await page.screenshot(), contentType: 'image/png' });
});
