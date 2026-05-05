import { expect, test } from '@playwright/test';

test('desktop backup action remains enabled and surfaces native errors', async ({ page }) => {
  await page.addInitScript(() => {
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
            throw new Error(
              'EPERM: operation not permitted, mkdir C:\\Users\\zephu\\AppData\\Roaming\\foliole\\backups'
            );
          case 'boot_report':
            return null;
          default:
            return null;
        }
      },
      onNativeMenuCommand: () => () => undefined,
      onWindowResized: () => () => undefined
    };
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
