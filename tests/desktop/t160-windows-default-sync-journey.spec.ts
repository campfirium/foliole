import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Page } from '@playwright/test';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EVIDENCE_ROOT = path.resolve(process.env.FOLIOLE_T160_EVIDENCE_ROOT?.trim()
  || '.tmp/artifacts/desktop-acceptance');
const TOPIC_TITLE = 'T160 Windows Journey Topic';
const TOPIC_BODY = 'T160 named content survives a complete Foliole relaunch on Windows.';

type SyncGroupObservation = { deviceName: string; groupTitle: string };

function expectPathInsideRoot(candidate: string, root: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  expect(relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))).toBe(true);
}

async function observeSyncGroup(page: Page, create: boolean): Promise<SyncGroupObservation> {
  const settings = await openSettingsCategory(page, 'Sync');
  const section = settings.getByLabel(/^(Sync section|同步设置区)$/);
  if (create) {
    const createButton = section.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ });
    await expect(createButton).toBeEnabled();
    await createButton.click();
  }
  const devices = section.getByRole('list', { name: /^(Devices|设备)$/ });
  await expect(devices).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  const device = devices.getByRole('listitem').first();
  const deviceName = (await device.locator('span').first().innerText()).trim();
  expect(deviceName).not.toBe('');
  await expect(device.getByText('Windows', { exact: true })).toBeVisible();

  const groupTitle = (await section.getByRole('heading', { level: 5 }).innerText()).trim();
  expect([`${deviceName}'s Sync Group`, `${deviceName} 的同步组`]).toContain(groupTitle);
  const syncControl = section.getByRole('switch', { name: /^(Sync|同步)$/ }).or(
    section.getByRole('button', { name: /^(Turn Off|关闭|Turn On|打开)$/ })
  );
  await expect(syncControl).toHaveCount(1);
  await expect(syncControl).toBeEnabled();
  await expect(section.getByRole('button', { name: /^(Sync Now|立即同步)$/ })).toBeEnabled();
  return { deviceName, groupTitle };
}

async function createNamedTopic(page: Page) {
  const editor = page.locator('.prompt-editor-host .cm-content');
  await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await editor.click();
  await page.keyboard.press('F2');
  const rename = page.locator('input[aria-label^="Rename "]');
  await expect(rename).toBeFocused();
  await page.keyboard.insertText(TOPIC_TITLE);
  await page.keyboard.press('Enter');
  await expect(editor).toBeFocused();
  await page.keyboard.insertText(TOPIC_BODY);
  const topic = page.getByRole('treeitem', { name: TOPIC_TITLE, exact: true });
  await expect(topic).toBeVisible();
  await expect(page.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ }))
    .toContainText(TOPIC_BODY);
  await page.getByRole('treeitem', { name: /^(Welcome to Foliole|欢迎使用 Foliole)$/ }).click();
  await topic.click();
  await expect(page.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ }))
    .toContainText(TOPIC_BODY);
}

async function observeNamedTopic(page: Page) {
  const topic = page.getByRole('treeitem', { name: TOPIC_TITLE, exact: true });
  await expect(topic).toBeVisible();
  await topic.click();
  await expect(page.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ }))
    .toContainText(TOPIC_BODY);
}

async function captureCheckpoint(page: Page, phase: 'before' | 'after') {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await page.screenshot({ fullPage: true,
    path: path.join(EVIDENCE_ROOT, `t160-${phase}-workspace.png`) });
  await openSettingsCategory(page, 'Sync');
  await page.screenshot({ fullPage: true,
    path: path.join(EVIDENCE_ROOT, `t160-${phase}-sync.png`) });
  await page.keyboard.press('Escape');
}

async function captureRelaunchCheckpoint(page: Page) {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await page.screenshot({ fullPage: true,
    path: path.join(EVIDENCE_ROOT, 't160-after-sync.png') });
  await page.keyboard.press('Escape');
  const workspacePath = path.join(EVIDENCE_ROOT, 't160-after-workspace.png');
  await page.screenshot({ fullPage: true, path: workspacePath });
  await observeNamedTopic(page);
  await page.screenshot({ fullPage: true, path: workspacePath });
}

test('keeps a Windows Sync Group and named content across a full isolated relaunch', async ({
  desktopSession
}) => {
  // SKIP: Windows-only product journey | 2026-08-30 | revive: run this acceptance on Windows
  test.skip(process.platform !== 'win32', 'Windows-only product journey');
  let secondSession: DesktopSession | null = null;
  const stateRoot = desktopSession.target.runtimeStateRoot;
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  expect(stateRoot).toBeTruthy();
  expect(libraryHome).toBeTruthy();
  expectPathInsideRoot(libraryHome!, stateRoot);

  try {
    await expectWorkspaceShell(desktopSession.firstWindow);
    const firstGroup = await observeSyncGroup(desktopSession.firstWindow, true);
    await desktopSession.firstWindow.keyboard.press('Escape');
    await createNamedTopic(desktopSession.firstWindow);
    await captureCheckpoint(desktopSession.firstWindow, 'before');
    await desktopSession.firstWindow
      .getByRole('treeitem', { name: /^(Welcome to Foliole|欢迎使用 Foliole)$/ }).click();

    await closeDesktopApplication(desktopSession.electronApp);
    secondSession = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    }) as DesktopSession;
    expect(secondSession.target.runtimeStateRoot).toBe(stateRoot);
    await secondSession.firstWindow.setViewportSize({ height: 1000, width: 1600 });
    await expectWorkspaceShell(secondSession.firstWindow);
    const secondGroup = await observeSyncGroup(secondSession.firstWindow, false);
    expect(secondGroup).toEqual(firstGroup);
    await captureRelaunchCheckpoint(secondSession.firstWindow);
  } finally {
    await secondSession?.close();
  }
});
