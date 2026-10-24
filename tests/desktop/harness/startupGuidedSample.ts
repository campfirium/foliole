import { expect, type Page } from '@playwright/test';

import { getGuidedSampleContent, getGuidedSampleRootTitles } from '../../../src/features/guidedSample/model/guidedSampleContent';

const SAMPLE_CHILD_COUNT = getGuidedSampleContent('en').children.length;
const SAMPLE_ROOT_TITLES = [...getGuidedSampleRootTitles()];

/**
 * An empty library builds the guided sample right after hydration and then opens it in Flow.
 * Waits until that startup work has fully landed, so it cannot interleave with the test's own
 * structure actions (a pending create blocks them, and later creates sit above them in undo).
 */
export async function waitForStartupGuidedSample(page: Page) {
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await expect.poll(() => page.evaluate((rootTitles) => {
    const api = window.__folioleWorkspaceDebug;
    const nodes = (api?.getWorkspaceStructureState?.().nodeOrder ?? [])
      .map((nodeId) => api?.getNode?.(nodeId))
      .filter((node) => node && !node.trashed);
    const root = nodes.find((node) => node && rootTitles.includes(node.title));
    return {
      childCount: nodes.filter((node) => root && node?.parentNodeId === root.id).length,
      createPending: Boolean(api?.getWorkspaceStructureHistory?.().pendingCreate),
      flowOnSample: Boolean(root) && api?.getReviewSession?.().currentNodeId === root?.id
    };
  }, SAMPLE_ROOT_TITLES), { timeout: 15_000 }).toEqual({
    childCount: SAMPLE_CHILD_COUNT,
    createPending: false,
    flowOnSample: true
  });
}
