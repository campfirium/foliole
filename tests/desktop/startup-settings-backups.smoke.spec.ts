import { promises as fs } from 'node:fs';

import type { Page } from '@playwright/test';

import { expectBridgeBackedControlEnabled } from './harness/bridgeBackedControls';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const CLOSE_BUTTON_NAME = /^(Close|关闭)$/;
const CREATE_BACKUP_BUTTON_NAME = /^(Create backup|创建备份)$/;
const MAXIMIZE_BUTTON_NAME = /^(Maximize|最大化)$/;
const MINIMIZE_BUTTON_NAME = /^(Minimize|最小化)$/;
const RESTORE_BUTTON_NAME = /^(Restore|恢复)$/;
const RESTORE_SUCCESS_TITLE = /^(Backup restored|备份已恢复)$/;
const RESTORE_DONE_BUTTON_NAME = /^(Done|完成)$/;
const AUTO_BACKUP_FILE_NAME = /^foliole-auto-backup-\d{6}-\d{6}\.db\.gz$/;
const SAFETY_BACKUP_FILE_NAME = /^pre-restore-.*\.db\.gz$/;

test.describe('desktop smoke', () => {
  test('startup renders the desktop workspace shell', async ({ desktopSession, desktopWindow }) => {
    expect(desktopSession.appReady.reported).toBe(true);
    expect(desktopSession.snapshot.isReady).toBe(true);
    await expectWorkspaceShell(desktopWindow);
  });

  test('titlebar window controls are enabled through the desktop bridge', async ({ desktopSession, desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);

    await expectBridgeBackedControlEnabled({
      controlName: 'Minimize',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: MINIMIZE_BUTTON_NAME }),
      windowPage: desktopWindow
    });
    await expectBridgeBackedControlEnabled({
      controlName: 'Maximize',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: MAXIMIZE_BUTTON_NAME }),
      windowPage: desktopWindow
    });
    await expectBridgeBackedControlEnabled({
      controlName: 'Close',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: CLOSE_BUTTON_NAME }),
      windowPage: desktopWindow
    });
  });

  test('settings creates, lists, and restores a compressed safety backup', async ({ desktopSession, desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await openBackupsSection(desktopWindow);
    const createBackupButton = desktopWindow.getByRole('button', { name: CREATE_BACKUP_BUTTON_NAME });

    await expectBridgeBackedControlEnabled({
      controlName: 'Create backup',
      desktopSession,
      locator: createBackupButton,
      windowPage: desktopWindow
    });
    await createBackupButton.click();

    await expect(desktopWindow.getByText(/^Backup created:/)).toBeVisible();
    await expectBridgeBackedControlEnabled({
      controlName: 'Restore',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: RESTORE_BUTTON_NAME }).first(),
      windowPage: desktopWindow
    });

    const restoreButton = desktopWindow.getByRole('button', { name: RESTORE_BUTTON_NAME }).first();
    await restoreButton.click();
    await expect(desktopWindow.getByRole('dialog').getByRole('heading', { name: RESTORE_SUCCESS_TITLE })).toBeVisible();
    await expect(desktopWindow.locator('button').filter({ hasText: RESTORE_BUTTON_NAME }).first()).toBeEnabled();
    await desktopWindow.screenshot({ path: '.tmp/artifacts/desktop-acceptance/backup-restore-success-dialog.png' });
    await desktopWindow.getByRole('button', { name: RESTORE_DONE_BUTTON_NAME }).click();
    await expect(desktopWindow.getByRole('heading', { name: RESTORE_SUCCESS_TITLE })).not.toBeVisible();
    await verifyCompressedSafetyBackup(desktopWindow);
    await expectWorkspaceShell(desktopWindow);
  });

});

async function readPrefix(filePath: string) {
  const handle = await fs.open(filePath, 'r');
  try {
    const prefix = Buffer.alloc(2);
    await handle.read(prefix, 0, prefix.length, 0);
    return [...prefix];
  } finally {
    await handle.close();
  }
}

async function verifyCompressedSafetyBackup(desktopWindow: Page) {
  const backups = await desktopWindow.evaluate(async () =>
    globalThis.window?.electronAPI?.invoke('list_sqlite_backups', {}));
  const safetyBackup = (backups as Array<{ fileName: string; filePath: string; kind: string }>)
    .find((entry) => entry.kind === 'snapshot' && SAFETY_BACKUP_FILE_NAME.test(entry.fileName));
  expect(safetyBackup).toBeDefined();
  await expect(readPrefix(safetyBackup?.filePath ?? '')).resolves.toEqual([0x1f, 0x8b]);
  await expect(desktopWindow.getByRole('heading', { name: SAFETY_BACKUP_FILE_NAME })).toBeVisible();
  await desktopWindow.screenshot({
    path: '.tmp/artifacts/desktop-acceptance/compressed-safety-backup-restore-point.png'
  });
  await expect(desktopWindow.evaluate(async (sourcePath) =>
    globalThis.window?.electronAPI?.invoke('restore_sqlite_database', { sourcePath }),
  safetyBackup?.filePath ?? '')).resolves.toMatchObject({ sourcePath: safetyBackup?.filePath });
}

test.describe('automatic backup restore points', () => {
  test('lists one compact automatic restore point without a frequency type', async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await openBackupsSection(desktopWindow);

    await expect(desktopWindow.getByRole('heading', { name: AUTO_BACKUP_FILE_NAME })).toBeVisible();
    await expect(desktopWindow.getByText(/Auto backup · (hourly|daily|weekly|monthly)/i)).toHaveCount(0);
    await desktopWindow.screenshot({
      path: '.tmp/artifacts/desktop-acceptance/automatic-backup-restore-point.png'
    });
  });
});
