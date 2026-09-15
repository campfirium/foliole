import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expectBridgeBackedControlEnabled } from './harness/bridgeBackedControls';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const CREATE_BACKUP_BUTTON_NAME = /^(Create backup|创建备份)$/;
const RESTORE_BUTTON_NAME = /^(Restore|恢复)$/;
const RESTORE_SUCCESS_NOTICE = /^(The backup .+ has been restored\.|已恢复备份 .+。)$/;
const AUTO_BACKUP_FILE_NAME = /^foliole-auto-\d{6}-\d{6}\.db\.gz$/;
const SAFETY_BACKUP_FILE_NAME = /^foliole-rollback-\d{6}-\d{6}(?:-\d+)?\.db\.gz$/;
const RESTORE_DRIFT_NODE_ID = 'desktop-backup-restore-drift';
const POST_RESTORE_TOPIC_TITLE = 'T198 post-restore edit';
const POST_RESTORE_TOPIC_CONTENT = `# ${POST_RESTORE_TOPIC_TITLE}\n\nSaved after the restored session became active.`;
const RESTORE_SETTINGS_ARTIFACT_PATH = path.join(
  process.cwd(), '.tmp/artifacts/desktop-acceptance/backup-restore-current-settings.png'
);

test.describe('desktop smoke', () => {
  test('startup renders the desktop workspace shell', async ({ desktopSession, desktopWindow }) => {
    expect(desktopSession.appReady.reported).toBe(true);
    expect(desktopSession.snapshot.isReady).toBe(true);
    await expectWorkspaceShell(desktopWindow);
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
    await createRestoreDriftTopic(desktopWindow);
    await expectBridgeBackedControlEnabled({
      controlName: 'Restore',
      desktopSession,
      locator: desktopWindow.getByRole('button', { name: RESTORE_BUTTON_NAME }).first(),
      windowPage: desktopWindow
    });

    const restoreButton = desktopWindow.getByRole('button', { name: RESTORE_BUTTON_NAME }).first();
    await restoreButton.click();
    await expect(desktopWindow.getByText(RESTORE_SUCCESS_NOTICE)).toBeVisible();
    await expect(hasRestoreDriftTopic(desktopWindow)).resolves.toBe(false);
    await expect(desktopWindow.getByText('Backup restore drift')).toHaveCount(0);
    await desktopWindow.screenshot({ path: '.tmp/artifacts/desktop-acceptance/backup-restore-success-notice.png' });
    await createPostRestoreTopic(desktopWindow);
    await expect.poll(() => hasTopic(desktopWindow, POST_RESTORE_TOPIC_TITLE)).toBe(true);
    await openBackupsSection(desktopWindow);
    await verifyCompressedSafetyBackup(desktopWindow);
    await expectWorkspaceShell(desktopWindow);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    const restarted = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    try {
      await expectWorkspaceShell(restarted.firstWindow);
      await expect(restarted.firstWindow.getByRole('treeitem', { name: POST_RESTORE_TOPIC_TITLE })).toBeVisible();
      await expect(hasRestoreDriftTopic(restarted.firstWindow)).resolves.toBe(false);
    } finally {
      await restarted.electronApp.close();
    }
  });

});

test.describe('backup restore controls', () => {
  test('restores content while keeping current backup controls', async ({ desktopSession, desktopWindow }, testInfo) => {
    await expectWorkspaceShell(desktopWindow);
    const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('Missing isolated Library home.');
    const oldBackupDir = path.join(libraryHome, 'old-backups');
    const currentBackupDir = path.join(libraryHome, 'current-backups');
    await saveBackupControls(desktopWindow, {
      backup_dir: oldBackupDir,
      daily_max_count: 2,
      hourly_max_count: 2
    });
    const backup = await desktopWindow.evaluate(async () =>
      window.electronAPI.invoke('backup_sqlite_database', {})) as { destinationPath: string };

    await saveBackupControls(desktopWindow, {
      backup_dir: currentBackupDir,
      daily_max_count: 4,
      extra_backup_dir: path.join(libraryHome, 'current-extra-backups'),
      extra_backup_max_count: 3,
      hourly_max_count: 6,
      retention_priority: ['daily', 'weekly', 'hourly', 'monthly'],
      safety_max_count: 3,
      weekly_max_count: 2
    });
    const current = await loadBackupControls(desktopWindow);
    await createRestoreDriftTopic(desktopWindow);
    await desktopWindow.evaluate(async (sourcePath) =>
      window.electronAPI.invoke('restore_sqlite_database', { sourcePath }), backup.destinationPath);

    await expect(hasRestoreDriftTopic(desktopWindow)).resolves.toBe(false);
    const restored = await loadBackupControls(desktopWindow);
    expect({ ...restored, updated_at: '' }).toEqual({ ...current, updated_at: '' });
    expect((await fs.readdir(currentBackupDir)).some((name) => SAFETY_BACKUP_FILE_NAME.test(name))).toBe(true);
    await expect(fs.access(backup.destinationPath)).resolves.toBeUndefined();

    const dialog = await openBackupsSection(desktopWindow);
    await fs.mkdir(path.dirname(RESTORE_SETTINGS_ARTIFACT_PATH), { recursive: true });
    await dialog.screenshot({ path: RESTORE_SETTINGS_ARTIFACT_PATH });
    await testInfo.attach('backup-restore-current-settings', {
      contentType: 'image/png', path: RESTORE_SETTINGS_ARTIFACT_PATH
    });
  });
});

async function loadBackupControls(desktopWindow: Page) {
  return desktopWindow.evaluate(async () =>
    window.electronAPI.invoke('load_backup_settings')) as Promise<Record<string, unknown>>;
}

async function saveBackupControls(desktopWindow: Page, settings: Record<string, unknown>) {
  return desktopWindow.evaluate(async (value) =>
    window.electronAPI.invoke('save_backup_settings', { settings: value }), settings) as Promise<Record<string, unknown>>;
}

async function createRestoreDriftTopic(desktopWindow: Page) {
  await desktopWindow.evaluate(async (nodeId) => {
    const snapshot = await globalThis.window?.electronAPI?.invoke('load_workspace_list_snapshot', {}) as {
      nodeOrder: string[];
    };
    const now = new Date().toISOString();
    await globalThis.window?.electronAPI?.invoke('create_topic', {
      activeNodeId: nodeId,
      anchorLink: null,
      content: '# This topic must disappear after restore',
      createdAt: now,
      isTitleManual: true,
      kind: 'topic',
      nodeId,
      nodeOrder: [...snapshot.nodeOrder, nodeId],
      parentNodeId: null,
      position: snapshot.nodeOrder.length,
      reveal: null,
      title: 'Backup restore drift',
      updatedAt: now
    });
  }, RESTORE_DRIFT_NODE_ID);
}

async function createPostRestoreTopic(desktopWindow: Page) {
  const beforeId = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate((previousId) => {
    const activeId = window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    return activeId && activeId !== previousId ? activeId : null;
  }, beforeId)).not.toBeNull();
  await expect.poll(() => desktopWindow.evaluate(() => (
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0) ?? false
  ))).toBe(true);
  await desktopWindow.locator('.prompt-editor-host .cm-content').click();
  await desktopWindow.keyboard.insertText(POST_RESTORE_TOPIC_CONTENT);
  await expect(desktopWindow.getByRole('treeitem', { name: POST_RESTORE_TOPIC_TITLE })).toBeVisible();
}

async function hasRestoreDriftTopic(desktopWindow: Page) {
  return desktopWindow.evaluate(async (nodeId) => {
    const snapshot = await globalThis.window?.electronAPI?.invoke('load_workspace_list_snapshot', {}) as {
      nodesById: Record<string, unknown>;
    };
    return nodeId in snapshot.nodesById;
  }, RESTORE_DRIFT_NODE_ID);
}

async function hasTopic(desktopWindow: Page, title: string) {
  return desktopWindow.evaluate(async (expectedTitle) => {
    const snapshot = await window.electronAPI.invoke('load_workspace_list_snapshot', {}) as {
      nodesById: Record<string, { title?: string }>;
    };
    return Object.values(snapshot.nodesById).some((node) => node.title === expectedTitle);
  }, title);
}

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
