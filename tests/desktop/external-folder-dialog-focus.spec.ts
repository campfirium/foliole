import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('external folder setup dialog opens without an initial button focus ring', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: /^External Folder$/ }).click();

  const dialog = desktopWindow.getByRole('dialog', { name: /^(Connect an external folder|连接外部文件夹)$/ });
  await expect(dialog).toBeVisible();
  const cancelButton = dialog.getByRole('button', { name: /^(Cancel|取消)$/ });
  await expect(cancelButton).toBeVisible();

  await expect
    .poll(() =>
      cancelButton.evaluate((button) => {
        const styles = window.getComputedStyle(button);
        return {
          active: document.activeElement === button,
          boxShadow: styles.boxShadow,
          outlineStyle: styles.outlineStyle,
          outlineWidth: styles.outlineWidth
        };
      })
    )
    .toMatchObject({
      active: false,
      boxShadow: 'none',
      outlineStyle: 'none',
      outlineWidth: '0px'
    });

  const screenshot = await dialog.screenshot({
    path: '.tmp/artifacts/external-folder-dialog-initial-focus.png'
  });
  await testInfo.attach('external-folder-dialog-initial-focus', {
    body: screenshot,
    contentType: 'image/png'
  });
});
