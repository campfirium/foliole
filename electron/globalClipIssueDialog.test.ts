// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  app: { getLocale: vi.fn(() => 'en-US') },
  dialog: { showMessageBox: vi.fn(async () => ({ checkboxChecked: false, response: 0 })) },
  shell: { openExternal: vi.fn(async () => undefined) }
}));

vi.mock('electron', () => electronMocks);

import {
  presentGlobalClipIssue,
  resolveGlobalClipCopyIssue,
  resolveGlobalClipIssueDialogOptions
} from './globalClipIssueDialog.js';

beforeEach(() => {
  vi.clearAllMocks();
  electronMocks.dialog.showMessageBox.mockResolvedValue({ checkboxChecked: false, response: 0 });
});

it('asks before opening Accessibility settings', async () => {
  await expect(presentGlobalClipIssue('permissionRequired', 'darwin')).resolves.toBe(true);
  expect(electronMocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
    buttons: ['Cancel', 'Open System Settings'],
    cancelId: 0,
    defaultId: 1,
    type: 'warning'
  }));
  expect(electronMocks.shell.openExternal).not.toHaveBeenCalled();
});

it('opens Accessibility settings only after explicit confirmation', async () => {
  electronMocks.dialog.showMessageBox.mockResolvedValue({ checkboxChecked: false, response: 1 });
  await presentGlobalClipIssue('permissionRequired', 'darwin');
  expect(electronMocks.shell.openExternal).toHaveBeenCalledWith(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  );
});

it('keeps ordinary clip problems in a native informational dialog', () => {
  expect(resolveGlobalClipIssueDialogOptions('empty', 'zh-CN')).toMatchObject({
    buttons: ['知道了'],
    detail: '请先选择文本或复制图片。',
    message: '没有剪辑内容',
    type: 'info'
  });
});

it('maps copy permission problems to issue dialogs', () => {
  expect(resolveGlobalClipCopyIssue('granted')).toBeNull();
  expect(resolveGlobalClipCopyIssue('denied')).toBe('permissionRequired');
  expect(resolveGlobalClipCopyIssue('unavailable')).toBe('copyFailed');
});
