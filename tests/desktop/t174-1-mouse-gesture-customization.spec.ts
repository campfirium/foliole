import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const FIRST_ID = 'playwright-t174-first';
const SECOND_ID = 'playwright-t174-second';
const CUSTOM_COMMAND_ID = 'workspace.openSearch';

async function focusVisibleSession(session: Awaited<ReturnType<typeof launchDesktopSession>>) {
  if (process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN === '1') return;
  const target = await session.electronApp.browserWindow(session.firstWindow);
  await target.evaluate((window) => {
    window.show();
    window.focus();
    window.webContents.focus();
  });
  await expect.poll(() => target.evaluate((window) => window.isFocused())).toBe(true);
}

async function configurePersistentCustomGesture(page: DesktopSession['firstWindow']) {
  await page.evaluate((commandId) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem(
      'foliole-mouse-gesture-bindings-v1',
      JSON.stringify([
        {
          commandId,
          directions: ['left', 'right', 'up'],
          gesture: 'left-right-up',
          isCustom: true
        }
      ])
    );
  }, CUSTOM_COMMAND_ID);
  await page.reload();
  await expectWorkspaceShell(page);
}

async function seedGestureWorkspace(page: DesktopSession['firstWindow']) {
  const longBody = ['# Gesture target', ...Array.from({ length: 240 }, (_, index) => `Paragraph ${index}`)].join('\n\n');
  await page.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await page.evaluate(async ({ firstId, secondId, content }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: '# First gesture topic\n\nBack target', id: firstId, kind: 'topic', title: 'Gesture First' },
      { content, id: secondId, kind: 'topic', title: 'Gesture Second' }
    ]);
    await api?.openNode?.(firstId);
    await api?.openNode?.(secondId);
  }, { content: longBody, firstId: FIRST_ID, secondId: SECOND_ID });
  await expect.poll(() => page.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(SECOND_ID);
}

async function drawGesture(page: DesktopSession['firstWindow'], segments: Array<[number, number]>) {
  const surface = page.locator('.markdown-editor-host');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (!box) throw new Error('editor gesture surface has no bounding box');
  let x = box.x + box.width / 2;
  let y = box.y + Math.min(box.height / 2, 320);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  for (const [dx, dy] of segments) {
    x += dx;
    y += dy;
    await page.mouse.move(x, y, { steps: 4 });
  }
  await page.mouse.up({ button: 'right' });
}

async function expectCustomSearchGesture(page: DesktopSession['firstWindow']) {
  await drawGesture(page, [[-70, 0], [70, 0], [0, -70]]);
  const search = page.getByRole('dialog', { name: /Search/i });
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
}

test('customizes mouse gestures and preserves execution across relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await configurePersistentCustomGesture(desktopWindow);
    const settings = await openSettingsDialog(desktopWindow);
    await settings.getByRole('button', { name: 'Mouse gestures', exact: true }).click();
    await expect(settings.getByRole('switch', { name: 'Mouse gestures' })).toBeChecked();
    await expect(settings.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'false');
    await expect(settings.getByRole('heading', { name: 'Bindings' })).toBeVisible();
    const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/t174-1-mouse-gesture-settings.png');
    await settings.screenshot({ path: screenshotPath });
    await testInfo.attach('mouse-gesture-settings', { path: screenshotPath });
    await desktopWindow.keyboard.press('Escape');

    await seedGestureWorkspace(desktopWindow);
    await drawGesture(desktopWindow, [[-80, 0]]);
    await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(FIRST_ID);
    await expect(desktopWindow.getByRole('menu')).toBeHidden();
    await drawGesture(desktopWindow, [[80, 0]]);
    await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(SECOND_ID);

    await drawGesture(desktopWindow, [[-70, 0], [0, 90]]);
    await expect.poll(() => desktopWindow.locator('.markdown-editor-host .cm-scroller').evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await drawGesture(desktopWindow, [[-70, 0], [0, -90]]);
    await expect.poll(() => desktopWindow.locator('.markdown-editor-host .cm-scroller').evaluate((node) => node.scrollTop)).toBe(0);
    await expectCustomSearchGesture(desktopWindow);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
    await focusVisibleSession(secondSession);
    await expectWorkspaceShell(secondSession.firstWindow);
    await expectCustomSearchGesture(secondSession.firstWindow);
  } finally {
    await secondSession?.close();
  }
});
