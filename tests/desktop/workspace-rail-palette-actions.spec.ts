import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

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
