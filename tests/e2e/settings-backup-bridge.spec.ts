import { expect, test, type Page } from '@playwright/test';

type MockDesktopRuntimeOptions = {
  backupError?: string;
};

async function installMockDesktopRuntime(page: Page, options: MockDesktopRuntimeOptions = {}) {
  await page.addInitScript(({ backupError }) => {
    localStorage.setItem('foliole-settings-active-category', 'about');

    const workspaceSnapshot = {
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {},
      trashedNodeIds: []
    };

    window.electronAPI = {
      invoke: async (command: string) => {
        switch (command) {
          case 'window_is_maximized':
            return false;
          case 'load_app_settings_state':
            return {};
          case 'save_app_settings_state':
            return null;
          case 'load_workspace_snapshot':
            return workspaceSnapshot;
          case 'load_reading_progress':
            return null;
          case 'list_sqlite_backups':
            return [];
          case 'backup_sqlite_database':
            if (backupError) {
              throw new Error(backupError);
            }
            return {
              destinationPath: 'C:\\Users\\zephu\\AppData\\Roaming\\foliole\\backups\\foliole-test.db',
              remainingPages: 0,
              sourcePath: 'C:\\Users\\zephu\\AppData\\Roaming\\foliole\\foliole.db',
              totalPages: 3
            };
          case 'boot_report':
            return null;
          default:
            return null;
        }
      },
      onNativeMenuCommand: () => () => undefined,
      onWindowResized: () => () => undefined
    };
  }, options);
}

test('desktop backup action remains enabled and surfaces native errors', async ({ page }) => {
  await installMockDesktopRuntime(page, {
    backupError: 'EPERM: operation not permitted, mkdir C:\\Users\\zephu\\AppData\\Roaming\\foliole\\backups'
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();

  const createBackupButton = page.getByRole('button', { name: 'Create backup' });
  await expect(createBackupButton).toBeEnabled();

  await createBackupButton.click();

  await expect(
    page.getByText(/Backup creation failed: EPERM: operation not permitted/)
  ).toBeVisible();
});

test('desktop backup action unblocks after reload into a healthy bridge runtime', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('foliole-settings-active-category', 'about');
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Create backup' })).toBeDisabled();
  await expect(page.getByText('Desktop runtime required')).toBeVisible();

  await installMockDesktopRuntime(page, {
    backupError: 'EPERM: operation not permitted, mkdir C:\\Users\\zephu\\AppData\\Roaming\\foliole\\backups'
  });

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();

  const createBackupButton = page.getByRole('button', { name: 'Create backup' });
  await expect(createBackupButton).toBeEnabled();

  await createBackupButton.click();

  await expect(
    page.getByText(/Backup creation failed: EPERM: operation not permitted/)
  ).toBeVisible();
});
