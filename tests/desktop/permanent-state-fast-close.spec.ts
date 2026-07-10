import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ITEM_ID = 'playwright-durable-relearn-item';
const ITEM_TITLE = 'Durable Relearn Item';
const FOLDER_ID = 'playwright-durable-folder';
const TOPIC_ID = 'playwright-durable-reading-topic';
const TOPIC_TITLE = 'Durable Reading Topic';

async function seedDurableState(page: DesktopSession['firstWindow']) {
  await page.evaluate(async ({ folderId, itemId, itemTitle, topicId, topicTitle }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: '', id: folderId, kind: 'folder', title: 'Durable Folder' },
      {
        content: 'Prompt', id: itemId, kind: 'item', parentNodeId: folderId, reveal: 'Answer', title: itemTitle,
        review: { due: '2099-07-10T10:00:00.000Z', lastReviewAt: null, state: 0, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 0, lapses: 0 }
      },
      {
        content: Array.from({ length: 320 }, (_, index) => `Durable line ${index + 1}`).join('\n'),
        id: topicId, kind: 'topic', parentNodeId: folderId, title: topicTitle
      }
    ]);
    await api?.openNode?.(itemId);
  }, { folderId: FOLDER_ID, itemId: ITEM_ID, itemTitle: ITEM_TITLE, topicId: TOPIC_ID, topicTitle: TOPIC_TITLE });
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) await exitFlow.click();
  await expect.poll(() => page.evaluate(async ({ itemId, topicId }) => {
    const snapshot = await globalThis.window?.electronAPI?.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    return Boolean(snapshot?.nodesById?.[itemId] && snapshot.nodesById[topicId]);
  }, { itemId: ITEM_ID, topicId: TOPIC_ID })).toBe(true);
  await expect(page.getByRole('treeitem', { name: ITEM_TITLE })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: TOPIC_TITLE })).toBeVisible();
}

async function relearnItem(page: DesktopSession['firstWindow']) {
  await page.getByRole('treeitem', { name: ITEM_TITLE }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^(Relearn|重新学习)$/ }).click();
  await page.getByRole('button', { name: /^(Relearn|重新学习)$/ }).click();
  await expect.poll(() => page.evaluate((nodeId) => {
    const node = globalThis.window?.__folioleWorkspaceDebug?.getNode?.(nodeId);
    return Boolean(node && node.review === null);
  }, ITEM_ID)).toBe(true);
}

async function scrollTopicWithoutWaitingForDebounce(page: DesktopSession['firstWindow']) {
  await page.getByRole('treeitem', { name: TOPIC_TITLE }).click();
  const scroller = page.locator('.prompt-editor-host .cm-scroller');
  await scroller.waitFor({ state: 'visible' });
  await page.waitForFunction((nodeId) => (
    globalThis.window?.__folioleDebug?.getTraces?.().some((trace) => (
      trace.event === 'runtime.reading-position.applying-complete' &&
      (trace.payload as { activeNodeId?: string } | undefined)?.activeNodeId === nodeId
    )) === true
  ), TOPIC_ID, { timeout: 2000 });
  await scroller.hover();
  await page.mouse.wheel(0, 8000);
  await page.waitForFunction(() => (
    (document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null)?.scrollTop ?? 0
  ) > 0);
  return page.evaluate(() => {
    const editorScroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    return editorScroller?.scrollTop ?? 0;
  });
}

async function readRestoredState(page: DesktopSession['firstWindow']) {
  await page.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug?.isHydrated?.()));
  await page.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  return page.evaluate(({ itemId, topicId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const orderedIds = api?.listNodes?.().map((node) => node.id) ?? [];
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      itemReview: api?.getNode?.(itemId)?.review ?? null,
      itemIndex: orderedIds.indexOf(itemId),
      scrollTop: scroller?.scrollTop ?? 0,
      topicIndex: orderedIds.indexOf(topicId),
      viewState: api?.getNodeViewState?.(topicId) ?? null
    };
  }, { itemId: ITEM_ID, topicId: TOPIC_ID });
}

test('keeps order, relearn, and latest reading position across an immediate close', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(desktopWindow);
    await seedDurableState(desktopWindow);
    await relearnItem(desktopWindow);
    expect(await scrollTopicWithoutWaitingForDebounce(desktopWindow)).toBeGreaterThan(0);
    const readingTraces = await desktopWindow.evaluate(() => (
      globalThis.window?.__folioleDebug?.getTraces?.().filter((trace) => trace.event.includes('reading-position') || trace.event.includes('reading-progress')) ?? []
    ));
    await testInfo.attach('permanent-state-fast-close-traces', { body: JSON.stringify(readingTraces, null, 2), contentType: 'application/json' });
    expect(readingTraces.some((trace) => trace.event === 'reading-progress.capture-scroll')).toBe(true);
    await desktopWindow.getByRole('button', { name: /^(Close|关闭)$/ }).click();
    await desktopSession.electronApp.close();

    secondSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    await expectWorkspaceShell(secondSession.firstWindow);
    const restored = await readRestoredState(secondSession.firstWindow);
    await testInfo.attach('permanent-state-fast-close', { body: JSON.stringify(restored, null, 2), contentType: 'application/json' });

    expect(restored.activeNodeId).toBe(TOPIC_ID);
    expect(restored.itemReview).toBeNull();
    expect(restored.itemIndex).toBeGreaterThanOrEqual(0);
    expect(restored.topicIndex).toBeGreaterThan(restored.itemIndex);
    expect(restored.viewState?.scrollTop).toBeGreaterThan(0);
    expect(restored.scrollTop).toBeGreaterThan(0);
  } finally {
    await secondSession?.close();
  }
});
