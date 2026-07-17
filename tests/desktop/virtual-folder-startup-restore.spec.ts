import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const QUERY = 'startup-restore-title-token';
const TOPIC_ID = 'playwright-virtual-startup-topic';
const TOPIC_TITLE = 'Virtual startup-restore-title-token topic';
const HOME_TOPIC_ID = 'playwright-home-startup-topic';
const HOME_TOPIC_TITLE = 'Home startup restore topic';

function currentFolderContents(page: DesktopSession['firstWindow']) {
  return page.getByRole('complementary', { name: /^(Current folder contents|当前文件夹内容)$/ });
}

function virtualFolderTree(page: DesktopSession['firstWindow']) {
  return page.getByRole('tree', { name: /^(Virtual folder tree|虚拟文件夹树)$/ });
}

async function createAndOpenSavedSearch(page: DesktopSession['firstWindow']) {
  await page.evaluate(async ({ id, query, title }) => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([
      { content: `Body contains ${query}.`, id, kind: 'topic', title }
    ]);
  }, { id: TOPIC_ID, query: QUERY, title: TOPIC_TITLE });

  await virtualFolderTree(page).getByRole('treeitem', { name: /^(Virtual|虚拟文件夹)$/ }).click();
  const search = page.getByRole('searchbox', { name: /^(Search topics to save as list|搜索主题并保存为列表)$/ });
  await search.fill(QUERY);
  await page.getByRole('button', { name: /^(Save search|保存搜索)$/ }).click();
  await virtualFolderTree(page).getByRole('treeitem', { name: QUERY, exact: true }).click();
  const topicRow = currentFolderContents(page).getByRole('treeitem', { name: TOPIC_TITLE });
  await expect(topicRow).toBeVisible();
  await topicRow.click();
}

test('restores saved virtual results in the topic column after relaunch', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(desktopWindow);
    await createAndOpenSavedSearch(desktopWindow);
    await desktopWindow.waitForTimeout(1200);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    await expectWorkspaceShell(secondSession.firstWindow);

    await expect(virtualFolderTree(secondSession.firstWindow)
      .getByRole('treeitem', { name: QUERY, exact: true })).toHaveAttribute('aria-selected', 'true');
    const topicRow = currentFolderContents(secondSession.firstWindow)
      .getByRole('treeitem', { name: TOPIC_TITLE });
    await expect(topicRow).toBeVisible();
    const screenshotPath = path.resolve(
      '.tmp/artifacts/desktop-acceptance/virtual-folder-startup-restore.png'
    );
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await secondSession.firstWindow.screenshot({ path: screenshotPath });
    await testInfo.attach('virtual-folder-startup-restore', {
      contentType: 'image/png',
      path: screenshotPath
    });
  } finally {
    await secondSession?.close();
  }
});

test('keeps Home as the browse root after opening a topic and relaunching', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate(async ({ id, title }) => {
      await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([
        { content: 'Home startup body.', id, kind: 'topic', title }
      ]);
    }, { id: HOME_TOPIC_ID, title: HOME_TOPIC_TITLE });

    const homeRow = desktopWindow.getByRole('treeitem', { name: 'Home', exact: true });
    await homeRow.click();
    const topicRow = currentFolderContents(desktopWindow).getByRole('treeitem', { name: HOME_TOPIC_TITLE });
    await expect(topicRow).toBeVisible();
    await topicRow.click();
    await desktopWindow.waitForTimeout(1200);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    await expectWorkspaceShell(secondSession.firstWindow);

    await expect(secondSession.firstWindow.getByRole('treeitem', { name: 'Home', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await expect(currentFolderContents(secondSession.firstWindow)
      .getByRole('treeitem', { name: HOME_TOPIC_TITLE })).toBeVisible();
    const screenshotPath = path.resolve(
      '.tmp/artifacts/desktop-acceptance/home-folder-startup-restore.png'
    );
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await secondSession.firstWindow.screenshot({ path: screenshotPath });
    await testInfo.attach('home-folder-startup-restore', {
      contentType: 'image/png',
      path: screenshotPath
    });
  } finally {
    await secondSession?.close();
  }
});
