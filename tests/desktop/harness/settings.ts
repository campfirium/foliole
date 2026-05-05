import type { Locator, Page } from '@playwright/test';

async function waitForVisible(locator: Locator) {
  await locator.waitFor({ state: 'visible' });
}

export function getSettingsDialog(windowPage: Page): Locator {
  return windowPage.getByRole('dialog', { name: 'Settings dialog' });
}

export async function expectWorkspaceShell(windowPage: Page) {
  await waitForVisible(windowPage.getByLabel('Foliole workspace'));
  await waitForVisible(windowPage.getByRole('button', { name: 'Settings' }));
}

export async function openSettingsDialog(windowPage: Page) {
  const settingsDialog = getSettingsDialog(windowPage);

  if (!(await settingsDialog.isVisible())) {
    await windowPage.getByRole('button', { name: 'Settings' }).click();
  }

  await waitForVisible(settingsDialog);
  return settingsDialog;
}

export async function openSettingsCategory(windowPage: Page, categoryName: string) {
  const settingsDialog = await openSettingsDialog(windowPage);
  await settingsDialog.getByRole('button', { name: categoryName }).click();
  return settingsDialog;
}

export async function openBackupsSection(windowPage: Page) {
  const settingsDialog = await openSettingsCategory(windowPage, 'About');
  await waitForVisible(settingsDialog.getByRole('heading', { name: 'Backups' }));
  return settingsDialog;
}
