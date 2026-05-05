import { expect, test } from './harness/fixtures';
import { expectBridgeBackedControlEnabled } from './harness/bridgeBackedControls';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

test.describe('desktop smoke', () => {
  test('startup renders the desktop workspace shell', async ({ desktopSession, desktopWindow }) => {
    expect(desktopSession.appReady.reported).toBe(true);
    expect(desktopSession.snapshot.isReady).toBe(true);
    await expectWorkspaceShell(desktopWindow);
  });

  test('titlebar window controls are enabled in the visible desktop window', async ({ desktopSession, desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);

    await expectBridgeBackedControlEnabled({
      controlName: 'Minimize',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: 'Minimize' }),
      windowPage: desktopWindow
    });
    await expectBridgeBackedControlEnabled({
      controlName: 'Maximize',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: 'Maximize' }),
      windowPage: desktopWindow
    });
    await expectBridgeBackedControlEnabled({
      controlName: 'Close',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: 'Close' }),
      windowPage: desktopWindow
    });
  });

  test('settings exposes backup actions and creates a visible backup entry', async ({ desktopSession, desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await openBackupsSection(desktopWindow);
    const createBackupButton = desktopWindow.getByRole('button', { name: 'Create backup' });

    await expectBridgeBackedControlEnabled({
      controlName: 'Create backup',
      desktopSession,
      locator: createBackupButton,
      windowPage: desktopWindow
    });
    await createBackupButton.click();

    await expect(desktopWindow.getByText(/^Backup created:/)).toBeVisible();
    await expectBridgeBackedControlEnabled({
      controlName: 'Restore',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: 'Restore' }).first(),
      windowPage: desktopWindow
    });
  });
});
