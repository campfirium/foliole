import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const UPDATE_CHECK_STATE_KEY = 'foliole-update-check-state';
const UPDATE_NOTICE = /^(This version is not the latest\. We recommend updating before sending feedback\.|当前版本不是最新版本，建议更新后再提交反馈。)$/;

async function setUpdateCheckState(desktopWindow: Parameters<typeof expectWorkspaceShell>[0], state: unknown) {
  await desktopWindow.evaluate(({ key, state }) => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, { key: UPDATE_CHECK_STATE_KEY, state });
}

async function openFeedbackDialog(desktopWindow: Parameters<typeof expectWorkspaceShell>[0]) {
  await desktopWindow.getByRole('button', { name: /^(Send Feedback|发送反馈)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('textbox', { name: /^(Feedback|反馈)$/ })
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('feedback dialog shows the update notice only for a checked newer version', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);

  await setUpdateCheckState(desktopWindow, {
    lastCheckStatus: 'available',
    latestVersion: '9.0.0'
  });
  const outdatedDialog = await openFeedbackDialog(desktopWindow);
  await expect(outdatedDialog.getByText(UPDATE_NOTICE)).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(outdatedDialog).toBeHidden();

  await setUpdateCheckState(desktopWindow, {
    lastCheckStatus: 'current',
    latestVersion: null
  });
  const currentDialog = await openFeedbackDialog(desktopWindow);
  await expect(currentDialog.getByText(UPDATE_NOTICE)).toBeHidden();
});
