import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

const reminders = /^(Reminders|提醒)$/;
const messageLabel = /^(Message|提醒内容|内容)$/;
const timeLabel = /^(Time|时间)$/;
const addLabel = /^(New reminder|新建提醒|新增提醒)$/;
const saveLabel = /^(Save|保存)$/;
const enabledLabel = /^(Enabled|启用) · /;

function nextTestTime() {
  const now = new Date();
  const time = new Date(now);
  time.setMinutes(now.getMinutes() + (now.getSeconds() < 35 ? 1 : 2), 0, 0);
  return [time.getHours(), time.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
}

test('a daily rule created in Settings reaches macOS Notification Center', async ({ desktopApp, desktopWindow }, testInfo) => {
  // SKIP: macOS-only native Notification.getHistory assertion | 2026-11-10 | revive: equivalent Windows native observation
  test.skip(process.platform !== 'darwin', 'Requires macOS Notification Center history.');
  test.setTimeout(160_000);
  const message = `Foliole daily reminder acceptance ${Date.now()}`;
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: reminders }).click();
  await dialog.getByRole('button', { name: addLabel }).click();
  await dialog.getByRole('textbox', { name: messageLabel }).fill(message);
  await dialog.getByLabel(timeLabel, { exact: true }).fill(nextTestTime());
  await dialog.getByRole('button', { name: saveLabel }).click();

  const enabled = dialog.getByRole('checkbox', { name: enabledLabel });
  await expect(enabled).not.toBeChecked();
  await enabled.click();
  await expect(enabled).toBeChecked();
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await openSettingsDialog(desktopWindow);
  await expect(enabled).toBeChecked();
  await desktopWindow.screenshot({ path: testInfo.outputPath('desktop-reminder-settings.png') });

  await expect.poll(() => desktopApp.evaluate(async ({ Notification }, body) =>
    (await Notification.getHistory()).find(entry => entry.body === body)?.id, message),
  { timeout: 105_000, intervals: [500, 1000] }).not.toBeUndefined();
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await desktopApp.evaluate(async ({ Notification }, body) => {
    const delivered = (await Notification.getHistory()).find(entry => entry.body === body);
    if (delivered) Notification.remove(delivered.id);
  }, message);
});
