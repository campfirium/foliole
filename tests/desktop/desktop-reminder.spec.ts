import { DESKTOP_REMINDER_OPEN_DIVE_PREFIX } from '../../lib/platform/nativeReminderContract';

import { expect, test } from './harness/fixtures';
import { getSettingsDialog, openSettingsDialog } from './harness/settings';

const reminders = /^(Reminders|提醒)$/;
const messageLabel = /^(Message|提醒内容|内容)$/;
const timeLabel = /^(Time|时间)$/;
const addLabel = /^(New reminder|新建提醒|新增提醒)$/;
const saveLabel = /^(Save|保存)$/;

function nextTestTime() {
  const now = new Date();
  const time = new Date(now);
  time.setMinutes(now.getMinutes() + (now.getSeconds() < 35 ? 1 : 2), 0, 0);
  return [time.getHours(), time.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
}

test('a daily rule created in Settings reaches macOS Notification Center and opens Flow on activation', async ({ desktopApp, desktopWindow }, testInfo) => {
  // SKIP: macOS-only native Notification.getHistory assertion | 2026-11-10 | revive: equivalent Windows native observation
  test.skip(process.platform !== 'darwin', 'Requires macOS Notification Center history.');
  test.setTimeout(160_000);
  const message = `Foliole daily reminder acceptance ${Date.now()}`;
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect(exitFlow).toBeHidden();
  await desktopApp.evaluate(({ Notification }, body) => {
    const originalShow = Notification.prototype.show;
    Notification.prototype.show = function () {
      if (this.body === body) Reflect.set(globalThis, 'testReminderNotification', this);
      return originalShow.call(this);
    };
  }, message);
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: reminders }).click();
  await dialog.getByRole('button', { name: addLabel }).click();
  await dialog.getByRole('textbox', { name: messageLabel }).fill(message);
  await dialog.getByLabel(timeLabel, { exact: true }).fill(nextTestTime());
  await dialog.getByRole('radio', { name: /^(Open Flow|打开 Flow)$/ }).click();
  await dialog.getByRole('button', { name: saveLabel }).click();

  const enabled = dialog.getByRole('switch', { name: message });
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
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await desktopApp.evaluate(() => {
    const notification = Reflect.get(globalThis, 'testReminderNotification') as Electron.Notification;
    notification.emit('click');
  });
  await expect(exitFlow).toBeVisible();
  await openSettingsDialog(desktopWindow);
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await desktopApp.evaluate(async ({ Notification }, body) => {
    const delivered = (await Notification.getHistory()).find(entry => entry.body === body);
    if (delivered) Notification.remove(delivered.id);
  }, message);
});

test('a foreground rule delivers after the Foliole window stays focused', async ({ desktopApp, desktopWindow }, testInfo) => {
  // SKIP: macOS-only native Notification.getHistory assertion | 2026-11-10 | revive: equivalent Windows native observation
  test.skip(process.platform !== 'darwin', 'Requires macOS Notification Center history.');
  test.setTimeout(160_000);
  const message = `Foliole foreground reminder acceptance ${Date.now()}`;
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: reminders }).click();
  await dialog.getByRole('button', { name: addLabel }).click();
  await dialog.getByRole('textbox', { name: messageLabel }).fill(message);
  await dialog.getByRole('radio', { name: /^(Foreground duration|前台持续)$/ }).click();
  await dialog.getByRole('spinbutton', { name: /^(Minutes in foreground|前台时长（分钟）)$/ }).fill('1');
  await dialog.getByRole('button', { name: saveLabel }).click();

  const enabled = dialog.getByRole('switch', { name: message });
  await desktopApp.evaluate(({ app, Notification }) => {
    const evidence: Array<{ event: string; at: number }> = [];
    const record = (event: string) => { evidence.push({ event, at: Date.now() }); };
    Reflect.set(globalThis, 'reminderNativeEvidence', evidence);
    app.on('browser-window-focus', () => record('focus'));
    app.on('browser-window-blur', () => record('blur'));
    const originalShow = Notification.prototype.show;
    Notification.prototype.show = function () {
      record('notification.show');
      this.once('show', () => record('notification.shown'));
      this.once('failed', () => record('notification.failed'));
      return originalShow.call(this);
    };
  });
  try {
    await enabled.click();
    await expect(enabled).toBeChecked();
    await expect.poll(() => desktopApp.evaluate(({ BrowserWindow }) => Boolean(BrowserWindow.getFocusedWindow())))
      .toBe(true);
    await expect.poll(() => desktopApp.evaluate(async ({ Notification }, body) =>
      (await Notification.getHistory()).some(entry => entry.body === body), message),
    { timeout: 75_000, intervals: [1000] }).toBe(true);
  } finally {
    const evidence = await desktopApp.evaluate(() => Reflect.get(globalThis, 'reminderNativeEvidence') as unknown);
    await testInfo.attach('native-reminder-events', { body: JSON.stringify(evidence), contentType: 'application/json' });
    console.log('Foreground reminder native events:', JSON.stringify(evidence));
  }

  await enabled.click();
  await expect(enabled).not.toBeChecked();
  await desktopApp.evaluate(async ({ Notification }, body) => {
    const delivered = (await Notification.getHistory()).find(entry => entry.body === body);
    if (delivered) Notification.remove(delivered.id);
  }, message);
});


test('the reminder list and editor follow both desktop appearances', async ({ desktopWindow }, testInfo) => {
  const dialog = await openSettingsDialog(desktopWindow);
  const reminderTab = dialog.getByRole('button', { name: reminders });
  await reminderTab.click();
  const edit = dialog.getByRole('button', { name: /^(Edit reminder|编辑提醒): 🌱$/ });
  await expect(edit).toBeVisible();

  for (const [mode, label] of [['light', /^(Light|浅色)$/], ['dark', /^(Dark|深色)$/]] as const) {
    await dialog.getByRole('button', { name: /^(Appearance|外观)$/ }).click();
    await dialog.getByRole('radiogroup', { name: /^(Mode|模式)$/ }).getByRole('radio', { name: label }).click();
    await expect.poll(() => desktopWindow.evaluate(() => document.documentElement.dataset.resolvedBaseColor)).toBe(mode);
    await reminderTab.click();
    await expect(dialog.getByRole('switch', { name: /^(Enabled|启用): 🌱$/ })).not.toBeChecked();
    await expect(dialog.getByRole('switch', { name: /^(Enabled|启用): ☕$/ })).not.toBeChecked();
    await dialog.screenshot({ path: testInfo.outputPath(`reminders-${mode}-list.png`) });
    await edit.click();
    await expect(dialog.getByRole('textbox', { name: messageLabel })).toHaveValue('🌱');
    await expect(dialog.getByLabel(timeLabel, { exact: true })).toHaveValue('20:00');
    await dialog.screenshot({ path: testInfo.outputPath(`reminders-${mode}-editor.png`) });
    await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(edit).toBeVisible();
  }
});


test('a reminder can target a specific Dive and keeps the target after rename', async ({ desktopApp, desktopWindow }) => {
  const dive = await desktopWindow.evaluate(async () => {
    await window.electronAPI.invoke('create_dive', { title: 'History', sourceIds: [] });
    return await window.electronAPI.invoke('create_dive', { title: 'Physics', sourceIds: [] }) as { id: string };
  });
  await desktopWindow.reload();
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: reminders }).click();
  await dialog.getByRole('button', { name: addLabel }).click();
  await dialog.getByRole('textbox', { name: messageLabel }).fill('Review Physics');
  await dialog.getByRole('radio', { name: /^(Open Dive Flow|打开专题 Flow)$/ }).click();
  const save = dialog.getByRole('button', { name: saveLabel });
  await expect(save).toBeDisabled();
  await dialog.getByRole('button', { name: /Choose a Dive|选择专题/ }).click();
  await desktopWindow.getByRole('menuitem', { name: 'Physics' }).click();
  await save.click();
  await expect(dialog.getByText(/^(Daily at|每天) .* · Physics$/)).toBeVisible();

  await desktopWindow.evaluate(async id => {
    await window.electronAPI.invoke('rename_dive', { diveId: id, title: 'Physics II' });
  }, dive.id);
  await desktopWindow.reload();
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await openSettingsDialog(desktopWindow);
  await expect(dialog.getByText(/^(Daily at|每天) .* · Physics II$/)).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const target = await desktopApp.browserWindow(desktopWindow);
  await target.evaluate((window, commandId) => {
    window.webContents.send('foliole:native-menu-command', { commandId });
  }, DESKTOP_REMINDER_OPEN_DIVE_PREFIX + dive.id);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getReviewSession().dive?.id))
    .toBe(dive.id);
  await target.evaluate((window, commandId) => {
    window.webContents.send('foliole:native-menu-command', { commandId });
  }, DESKTOP_REMINDER_OPEN_DIVE_PREFIX + 'missing-dive');
  await expect(desktopWindow.getByText(/^(This Dive is unavailable\.|此专题不可用。)$/)).toBeVisible();
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getReviewSession().dive?.id)).toBe(dive.id);
});

test('the Dive context menu prefills the shared reminder editor without saving on open', async ({ desktopWindow }) => {
  await desktopWindow.evaluate(() => window.electronAPI.invoke('create_dive', { title: 'Physics', sourceIds: [] }));
  await desktopWindow.reload();
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const dive = desktopWindow.getByRole('treeitem', { name: 'Physics', exact: true });
  await dive.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Create reminder…|创建提醒…)$/ }).click();
  const dialog = getSettingsDialog(desktopWindow);
  await expect(dialog.getByRole('textbox', { name: messageLabel })).toHaveValue('Physics');
  await expect(dialog.getByRole('radio', { name: /^(Open Dive Flow|打开专题 Flow)$/ })).toBeChecked();
  await expect(dialog.getByRole('button', { name: /^(Dive|专题) Physics$/ })).toBeVisible();
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect(dialog.getByRole('switch', { name: /^(Enabled|启用): Physics$/ })).toHaveCount(0);

  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await dive.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Create reminder…|创建提醒…)$/ }).click();
  await expect(dialog.getByRole('textbox', { name: messageLabel })).toHaveValue('Physics');
  await dialog.getByRole('button', { name: saveLabel }).click();
  await expect(dialog.getByRole('switch', { name: /^(Enabled|启用): Physics$/ })).not.toBeChecked();
  await expect(dialog.getByText(/^(Daily at|每天) .* · Physics$/)).toBeVisible();
});
