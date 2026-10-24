import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { getGuidedSampleContent, getGuidedSampleRootTitles } from '../../lib/core/guidedSample/guidedSampleContent';

import { collectNode, focusWorkspace, openNode, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/guided-sample-content-hidden.png');
const SAMPLE_CHILD_COUNT = getGuidedSampleContent('en').children.length;
const SAMPLE_ROOT_TITLES = [...getGuidedSampleRootTitles()];
// Long enough for a startup that still built the sample in the renderer to have finished it.
const STARTUP_SETTLE_MS = 3000;

async function waitForHydration(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
}

async function readGuide(page: Page) {
  return page.evaluate((rootTitles) => {
    const api = window.__folioleWorkspaceDebug;
    const nodes = api?.listNodes().map(({ id }) => api.getNode(id)).filter((node) => node && !node.trashed) ?? [];
    const roots = nodes.filter((node) => node?.parentNodeId === 'special-inbox' && rootTitles.includes(node.title));
    const root = roots[0] ?? null;
    const history = api?.getWorkspaceStructureHistory?.();
    return {
      childIds: root ? nodes.filter((node) => node?.parentNodeId === root.id).map((node) => node!.id) : [],
      flowOnSample: Boolean(root) && api?.getReviewSession?.().currentNodeId === root?.id,
      pendingCreate: Boolean(history?.pendingCreate),
      rootContent: root?.content ?? null,
      rootCount: roots.length,
      rootId: root?.id ?? null,
      undoCount: history?.undoStack.length ?? -1
    };
  }, SAMPLE_ROOT_TITLES);
}

test('a new library opens with the guided sample already in place', async ({ desktopWindow }, testInfo) => {
  await waitForHydration(desktopWindow);
  const guide = await readGuide(desktopWindow);
  expect(guide).toMatchObject({ pendingCreate: false, rootCount: 1, undoCount: 0 });
  expect(guide.childIds).toHaveLength(SAMPLE_CHILD_COUNT);
  expect(guide.rootContent).toContain('asset://');
  await expect.poll(async () => (await readGuide(desktopWindow)).flowOnSample).toBe(true);
  await expect(desktopWindow.getByRole('main').getByRole('img', { name: 'image' }).first()).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT_PATH });
  await testInfo.attach('guided-sample-content-hidden', { contentType: 'image/png', path: SCREENSHOT_PATH });
});

test('deleting a sample topic right after startup can be undone', async ({ desktopWindow }) => {
  await waitForHydration(desktopWindow);
  const { childIds, rootId } = await readGuide(desktopWindow);
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await openNode(desktopWindow, rootId!);
  await focusWorkspace(desktopWindow);
  const targetId = childIds[0]!;
  await desktopWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode?.(id), targetId);
  await expect.poll(() => collectNode(desktopWindow, targetId)).toMatchObject({ trashed: true });
  await desktopWindow.keyboard.press(undoShortcut());
  await expect.poll(() => collectNode(desktopWindow, targetId)).toMatchObject({ trashed: false });
  expect((await readGuide(desktopWindow)).childIds).toHaveLength(SAMPLE_CHILD_COUNT);
});

test('a deleted guided sample does not come back after reload', async ({ desktopWindow }) => {
  await waitForHydration(desktopWindow);
  const { rootId } = await readGuide(desktopWindow);
  await desktopWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode?.(id), rootId!);
  await expect.poll(async () => (await readGuide(desktopWindow)).rootCount).toBe(0);
  await desktopWindow.reload();
  await waitForHydration(desktopWindow);
  await desktopWindow.waitForTimeout(STARTUP_SETTLE_MS);
  expect((await readGuide(desktopWindow)).rootCount).toBe(0);
});
