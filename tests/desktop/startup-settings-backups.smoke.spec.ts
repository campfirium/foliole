import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

test.describe('desktop smoke', () => {
  test('startup renders the desktop workspace shell', async ({ desktopSession, desktopWindow }) => {
    expect(desktopSession.appReady.reported).toBe(true);
    expect(desktopSession.snapshot.isReady).toBe(true);
    await expectWorkspaceShell(desktopWindow);
  });

  test('settings exposes the backups section and creates a visible backup entry', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await openBackupsSection(desktopWindow);
    const createBackupButton = desktopWindow.getByRole('button', { name: 'Create backup' });

    await expect(createBackupButton).toBeEnabled();
    await createBackupButton.click();

    await expect(desktopWindow.getByText(/^Backup created:/)).toBeVisible();
    await expect(desktopWindow.getByRole('button', { name: 'Restore' }).first()).toBeVisible();
  });
});
