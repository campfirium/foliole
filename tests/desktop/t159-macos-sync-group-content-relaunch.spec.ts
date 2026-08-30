import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Page, TestInfo } from '@playwright/test';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const TOPIC_TITLE = 'T159 Mac Journey Topic';
const TOPIC_BODY = 'T159 named content survives a complete Foliole relaunch.';

type SyncGroupObservation = {
  deviceName: string;
  groupTitle: string;
};

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
  const platform = (await device.locator('span').nth(1).innerText()).trim();
  expect(deviceName).not.toBe('');
  expect(platform).toBe('macOS');

  const heading = section.getByRole('heading', { level: 5 });
  await expect(heading).toBeVisible();
  const groupTitle = (await heading.innerText()).trim();
  expect([`${deviceName}'s Sync Group`, `${deviceName} 的同步组`]).toContain(groupTitle);
  return { deviceName, groupTitle };
}

async function createNamedTopic(page: Page) {
  const editor = page.locator('.prompt-editor-host .cm-content');
  await page.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await editor.click();
  await expect(editor).toBeFocused();
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

async function captureCheckpoint(page: Page, testInfo: TestInfo, phase: 'before' | 'after') {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const workspacePath = path.join(ARTIFACT_DIR, `t159-macos-journey-${phase}-workspace.png`);
  await page.screenshot({ fullPage: true, path: workspacePath });
  await testInfo.attach(`t159-${phase}-workspace`, { contentType: 'image/png', path: workspacePath });

  await openSettingsCategory(page, 'Sync');
  const syncPath = path.join(ARTIFACT_DIR, `t159-macos-journey-${phase}-sync.png`);
  await page.screenshot({ fullPage: true, path: syncPath });
  await testInfo.attach(`t159-${phase}-sync`, { contentType: 'image/png', path: syncPath });
  await page.keyboard.press('Escape');
}

test('keeps a Mac Sync Group and named content across a full isolated relaunch', async ({
  desktopSession
}, testInfo) => {
  // SKIP: macOS-only product journey | 2026-08-30 | revive: run this acceptance on a macOS host
  test.skip(process.platform !== 'darwin', 'macOS-only product journey');
  let secondSession: DesktopSession | null = null;
  const stateRoot = desktopSession.target.runtimeStateRoot;
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  expect(stateRoot).toBeTruthy();
  expect(libraryHome).toBeTruthy();
  expectPathInsideRoot(libraryHome!, stateRoot);

  try {
    await expectWorkspaceShell(desktopSession.firstWindow);
    const firstGroup = await test.step('create and observe the Sync Group', () => (
      observeSyncGroup(desktopSession.firstWindow, true)
    ));
    await desktopSession.firstWindow.keyboard.press('Escape');
    await test.step('create and observe named content', () => createNamedTopic(desktopSession.firstWindow));
    await captureCheckpoint(desktopSession.firstWindow, testInfo, 'before');

    await test.step('quit and relaunch the same isolated state root', async () => {
      await closeDesktopApplication(desktopSession.electronApp);
      secondSession = await launchDesktopSession({
        env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
      }) as DesktopSession;
      expect(secondSession.target.runtimeStateRoot).toBe(stateRoot);
      await expectWorkspaceShell(secondSession.firstWindow);
    });

    await test.step('observe the same content and Sync Group after relaunch', async () => {
      await observeNamedTopic(secondSession!.firstWindow);
      const secondGroup = await observeSyncGroup(secondSession!.firstWindow, false);
      expect(secondGroup).toEqual(firstGroup);
      await secondSession!.firstWindow.keyboard.press('Escape');
      await observeNamedTopic(secondSession!.firstWindow);
      await captureCheckpoint(secondSession!.firstWindow, testInfo, 'after');
    });
  } finally {
    await secondSession?.close();
  }
});
