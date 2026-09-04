import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';
import { INBOX_NODE_ID } from '../../src/features/nodes/model/specialNodes';

import { collectActiveEditorState } from './harness/contextualContentHistory';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const FIRST_ID = 'playwright-t174-first';
const SECOND_ID = 'playwright-t174-second';
const FIRST_CONTENT = '# First gesture topic\n\nBack target';
const SECOND_CONTENT = ['# Gesture target', ...Array.from({ length: 240 }, (_, index) => `Paragraph ${index}`)].join('\n\n');
const CUSTOM_COMMAND_ID = 'workspace.openSearch';
const LANGUAGE_KEY = 'foliole-app-language';
const MOUSE_GESTURE_BINDINGS_KEY = 'foliole-mouse-gesture-bindings-v1';
const MOUSE_GESTURE_HINT_KEY = 'foliole-mouse-gesture-hint-visible';

async function expectPersistentCustomGesture(page: DesktopSession['firstWindow']) {
  await expect.poll(() => page.evaluate(({ bindingsKey, commandId }) => {
    const raw = window.localStorage.getItem(bindingsKey);
    if (!raw) return false;
    const bindings = JSON.parse(raw) as Array<{ commandId?: unknown; gesture?: unknown }>;
    return bindings.some((binding) =>
      binding.commandId === commandId && binding.gesture === 'left-right-up'
    );
  }, { bindingsKey: MOUSE_GESTURE_BINDINGS_KEY, commandId: CUSTOM_COMMAND_ID })).toBe(true);
}

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
  await page.evaluate(async ({ bindingsKey, commandId, hintKey, languageKey }) => {
    const runtimeSettings = await window.electronAPI?.invoke('load_app_settings_state');
    const settings = runtimeSettings && typeof runtimeSettings === 'object'
      ? { ...runtimeSettings as Record<string, unknown> }
      : {};
    settings[languageKey] = 'en';
    settings[hintKey] = 'true';
    settings[bindingsKey] = JSON.stringify([
      {
        commandId,
        directions: ['left', 'right', 'up'],
        gesture: 'left-right-up',
        isCustom: true
      }
    ]);
    window.localStorage.setItem(languageKey, settings[languageKey] as string);
    window.localStorage.setItem(hintKey, settings[hintKey] as string);
    window.localStorage.setItem(bindingsKey, settings[bindingsKey] as string);
    await window.electronAPI?.invoke('save_app_settings_state', { settings });
  }, {
    bindingsKey: MOUSE_GESTURE_BINDINGS_KEY,
    commandId: CUSTOM_COMMAND_ID,
    hintKey: MOUSE_GESTURE_HINT_KEY,
    languageKey: LANGUAGE_KEY
  });
  await page.reload();
  await expectWorkspaceShell(page);
  await expectPersistentCustomGesture(page);
}

async function seedGestureWorkspace(page: DesktopSession['firstWindow']) {
  await page.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await page.evaluate(async ({ firstContent, firstId, secondContent, secondId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: firstContent, id: firstId, kind: 'topic', title: 'Gesture First' },
      { content: secondContent, id: secondId, kind: 'topic', title: 'Gesture Second' }
    ]);
    await api?.openNode?.(firstId);
    await api?.openNode?.(secondId);
  }, { firstContent: FIRST_CONTENT, firstId: FIRST_ID, secondContent: SECOND_CONTENT, secondId: SECOND_ID });
  await expectActiveEditorState(page, SECOND_ID, SECOND_CONTENT);
}

async function expectActiveEditorState(page: DesktopSession['firstWindow'], nodeId: string, content: string) {
  await expect.poll(() => collectActiveEditorState(page, nodeId)).toEqual({
    activeNodeId: nodeId,
    editorContent: content,
    nodeContent: content
  });
}

async function drawGesture(
  page: DesktopSession['firstWindow'],
  segments: Array<[number, number]>,
  expectedHint?: string,
  selector = '.markdown-editor-host'
) {
  const surface = page.locator(selector);
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (!box) throw new Error('editor gesture surface has no bounding box');
  let x = box.x + box.width / 2;
  let y = box.y + Math.min(box.height / 2, 320);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  const origin = { x, y };
  for (const [dx, dy] of segments) {
    x += dx;
    y += dy;
    await page.mouse.move(x, y, { steps: 4 });
  }
  if (expectedHint) {
    const hint = page.locator('[data-editor-gesture-hint="true"]');
    await expect(hint).toContainText(expectedHint);
    const hintBox = await hint.boundingBox();
    expect(hintBox && Math.hypot(hintBox.x - origin.x, hintBox.y - origin.y)).toBeLessThan(80);
    await expect(hint).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await page.mouse.up({ button: 'right' });
}

async function expectCustomSearchGesture(page: DesktopSession['firstWindow']) {
  await drawGesture(page, [[-70, 0], [70, 0], [0, -70]], '←→↑');
  const search = page.getByRole('dialog', { name: /Search/i });
  await expect(search).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
}

async function drawGestureWithReleaseOnlyFinalSegment(page: DesktopSession['firstWindow']) {
  const box = await page.locator('.markdown-editor-host').boundingBox();
  if (!box) throw new Error('editor gesture surface has no bounding box');
  const start = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 320) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x - 70, start.y);
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 2, buttons: 0, cancelable: true, clientX: x, clientY: y
    }));
  }, { x: start.x - 70, y: start.y + 90 });
  await page.mouse.up({ button: 'right' });
}

test('customizes mouse gestures and preserves execution across relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await configurePersistentCustomGesture(desktopWindow);
    const settings = await openSettingsDialog(desktopWindow);
    await settings.getByRole('button', { name: 'Mouse gestures', exact: true }).click();
    await expect(settings.getByRole('switch', { name: 'Mouse gestures' })).toBeChecked();
    await expect(settings.getByRole('button', { name: 'Gesture appearance' })).toHaveAttribute('aria-expanded', 'false');
    await expect(settings.getByRole('heading', { name: 'Gesture actions' })).toBeVisible();
    const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/t174-1-mouse-gesture-settings.png');
    await settings.screenshot({ path: screenshotPath });
    await testInfo.attach('mouse-gesture-settings', { path: screenshotPath });
    await desktopWindow.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(settings).toHaveCount(0);

    await seedGestureWorkspace(desktopWindow);
    await drawGesture(desktopWindow, [[-80, 0]], '←');
    await expectActiveEditorState(desktopWindow, FIRST_ID, FIRST_CONTENT);
    await expect(desktopWindow.getByRole('menu')).toBeHidden();
    await drawGesture(desktopWindow, [[80, 0]], '→');
    await expectActiveEditorState(desktopWindow, SECOND_ID, SECOND_CONTENT);

    await drawGesture(desktopWindow, [[-70, 0], [0, 90]], '←↓');
    await expect.poll(() => desktopWindow.locator('.markdown-editor-host .cm-scroller').evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await drawGesture(desktopWindow, [[-70, 0], [0, -90]], '←↑');
    await expect.poll(() => desktopWindow.locator('.markdown-editor-host .cm-scroller').evaluate((node) => node.scrollTop)).toBe(0);
    await drawGestureWithReleaseOnlyFinalSegment(desktopWindow);
    await expect.poll(() => desktopWindow.locator('.markdown-editor-host .cm-scroller').evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expectCustomSearchGesture(desktopWindow);

    await desktopWindow.evaluate(async ({ inboxId, secondId }) => {
      const api = globalThis.window?.__folioleWorkspaceDebug;
      await api?.openNode?.(inboxId);
      await api?.openNode?.(secondId);
    }, { inboxId: INBOX_NODE_ID, secondId: SECOND_ID });
    await expectActiveEditorState(desktopWindow, SECOND_ID, SECOND_CONTENT);
    await drawGesture(desktopWindow, [[-80, 0]], '←');
    const folderSurface = desktopWindow.locator('[data-folder-list-gesture-surface="true"]');
    await expect(folderSurface).toBeVisible();
    await drawGesture(desktopWindow, [[80, 0]], '→', '[data-folder-list-gesture-surface="true"]');
    await expectActiveEditorState(desktopWindow, SECOND_ID, SECOND_CONTENT);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } });
    await focusVisibleSession(secondSession);
    await expectWorkspaceShell(secondSession.firstWindow);
    await secondSession.firstWindow.waitForFunction(() =>
      Boolean(globalThis.window?.__folioleWorkspaceDebug?.isHydrated?.())
    );
    await expectPersistentCustomGesture(secondSession.firstWindow);
    await expectCustomSearchGesture(secondSession.firstWindow);
  } finally {
    await secondSession?.close();
  }
});
