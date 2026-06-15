import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EXTERNAL_DOCUMENT_MIRRORS_HEADING = /^(External document mirrors|外部文档镜像)$/;
const ENABLE_EXTERNAL_DOCUMENT_MIRRORS = /^(Enable external document mirrors|启用外部文档镜像)$/;

test.describe('desktop settings external document mirrors', () => {
  test('settings exposes external document mirrors copy', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    const settingsDialog = await openSettingsCategory(desktopWindow, 'ExternalDocumentMirrors');

    await expect(settingsDialog.getByRole('heading', { level: 2, name: EXTERNAL_DOCUMENT_MIRRORS_HEADING })).toBeVisible();
    await expect(settingsDialog.getByRole('switch', { name: ENABLE_EXTERNAL_DOCUMENT_MIRRORS })).toBeVisible();
  });
});
