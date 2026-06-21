import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function openFeedbackDialog(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  await desktopWindow.getByRole('button', { name: /^(Send Feedback|发送反馈)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('textbox', { name: /^(Feedback|反馈)$/ })
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('feedback dialog text field focus stays visually quiet', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const dialog = await openFeedbackDialog(desktopWindow);
  const feedbackText = dialog.getByRole('textbox', { name: /^(Feedback|反馈)$/ });
  await feedbackText.click();

  await expect
    .poll(() =>
      feedbackText.evaluate((input) => {
        const styles = window.getComputedStyle(input);
        return {
          active: document.activeElement === input,
          boxShadow: styles.boxShadow,
          outlineStyle: styles.outlineStyle,
          outlineWidth: styles.outlineWidth
        };
      })
    )
    .toMatchObject({
      active: true,
      boxShadow: 'none',
      outlineStyle: 'none',
      outlineWidth: '0px'
    });

  const screenshot = await dialog.screenshot({
    path: '.lab/atlas/0active/feedback-dialog-input-focus.png'
  });
  await testInfo.attach('feedback-dialog-input-focus', {
    body: screenshot,
    contentType: 'image/png'
  });
});
