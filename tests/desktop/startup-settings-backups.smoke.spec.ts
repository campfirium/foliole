import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

async function expectWorkspaceShell(windowPage: Page) {
  await expect(windowPage.getByLabel('Foliole workspace')).toBeVisible();
  await expect(windowPage.getByRole('button', { name: 'Settings' })).toBeVisible();
}

async function openBackupsSection(windowPage: Page) {
  await windowPage.getByRole('button', { name: 'Settings' }).click();

  const settingsDialog = windowPage.getByRole('dialog', { name: 'Settings dialog' });
  await expect(settingsDialog).toBeVisible();

  await settingsDialog.getByRole('button', { name: 'About' }).click();
  await expect(settingsDialog.getByRole('heading', { name: 'Backups' })).toBeVisible();
}

test.describe('desktop smoke', () => {
  test('startup renders the desktop workspace shell', async ({ desktopSession, desktopWindow }) => {
    expect(desktopSession.snapshot.isReady).toBe(true);
    await expectWorkspaceShell(desktopWindow);
  });

  test('settings exposes the backups section', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await openBackupsSection(desktopWindow);
    await expect(desktopWindow.getByRole('button', { name: 'Create backup' })).toBeEnabled();
  });
});
