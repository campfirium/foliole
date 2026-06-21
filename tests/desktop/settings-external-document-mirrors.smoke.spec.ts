import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EXTERNAL_FOLDER_HEADING = /^(External Folder|外部文件夹)$/;

test.describe('desktop settings External Folder', () => {
  test('settings exposes External Folder copy', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalDocumentMirrors');

    await expect(settingsDialog.getByRole('heading', { level: 2, name: EXTERNAL_FOLDER_HEADING })).toBeVisible();
  });
});
