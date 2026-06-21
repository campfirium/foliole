import type { Locator } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function dismissSearchEnhancementPrompt(desktopWindow: import('@playwright/test').Page) {
  const prompt = desktopWindow.getByRole('dialog', {
    name: /(Turn on search enhancement for languages without spaces|要为无空格语言开启搜索增强|使用中文、日文或韩文搜索)/
  });
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.getByRole('button', { name: /(Not now|暂不)/ }).click();
    return true;
  }
  return false;
}

async function expectPaletteInputNoFocusRing(input: Locator) {
  await expect(input).toHaveClass(/appearance-none/);
  await expect(input).toHaveClass(/\[box-shadow:none\]/);
  await expect(input).toHaveClass(/focus:\[box-shadow:none\]/);
  await expect(input).toHaveClass(/focus-visible:\[box-shadow:none\]/);
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
          outlineWidth: styles.outlineWidth,
          webkitAppearance: styles.getPropertyValue('-webkit-appearance')
        };
      })
    )
    .toMatchObject({
      boxShadow: 'none',
      outlineStyle: 'none',
      outlineWidth: '0px'
    });
}

test('workspace rail opens search and command palette panels', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const ribbon = desktopWindow.getByRole('region', { name: /Workspace Ribbon|工作区功能区/ });

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

  await testInfo.attach('command-palette-autofill-suppression', {
    body: await commandDialog.screenshot(),
    contentType: 'image/png'
  });
});
