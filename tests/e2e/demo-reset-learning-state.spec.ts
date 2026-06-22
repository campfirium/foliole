import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_STORAGE_KEY = 'foliole-workspace-v1';
const DEMO_E2E_ENABLED = process.env.FOLIOLE_DEMO_E2E === '1';

type LearningSnapshot = {
  activeNodeId: string | null;
  flowTitles: string[];
  reading: Record<string, { repetitionCount?: number; state?: string }>;
  review: Record<string, { lapses?: number; lastReviewAt?: string | null; reps?: number; state?: number }>;
  reviewSession: {
    currentNodeId?: string | null;
    isAnswerRevealed?: boolean;
    queueNodeIds?: string[];
    soonNodeIds?: string[];
  };
};

type WorkspacePayload = {
  state: {
    activeNodeId: string | null;
    nodesById: Record<string, {
      reading?: { repetitionCount?: number; state?: string } | null;
      review?: { lapses?: number; lastReviewAt?: string | null; reps?: number; state?: number } | null;
    }>;
    reviewSession?: LearningSnapshot['reviewSession'];
  };
};

async function waitForDemoWorkspace(page: Page) {
  await expect(page.getByLabel('Foliole workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Reset data' })).toBeVisible({ timeout: 30_000 });
}

async function clearDemoStorage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
}

async function readLearningSnapshot(page: Page): Promise<LearningSnapshot> {
  const flowTitles = await page.locator('ol[aria-label="Flow items"] button').allTextContents();
  const storageSnapshot = await page.evaluate((storageKey) => {
    const rawPayload = window.localStorage.getItem(storageKey);
    if (!rawPayload) throw new Error('Demo workspace payload was not stored.');

    const payload = JSON.parse(rawPayload) as WorkspacePayload;
    const reading: LearningSnapshot['reading'] = {};
    const review: LearningSnapshot['review'] = {};
    Object.entries(payload.state.nodesById).forEach(([nodeId, node]) => {
      if (node.reading) {
        reading[nodeId] = {
          repetitionCount: node.reading.repetitionCount,
          state: node.reading.state
        };
      }
      if (node.review) {
        review[nodeId] = {
          lapses: node.review.lapses,
          lastReviewAt: node.review.lastReviewAt,
          reps: node.review.reps,
          state: node.review.state
        };
      }
    });

    return {
      activeNodeId: payload.state.activeNodeId,
      reading,
      review,
      reviewSession: {
        currentNodeId: payload.state.reviewSession?.currentNodeId,
        isAnswerRevealed: payload.state.reviewSession?.isAnswerRevealed,
        queueNodeIds: payload.state.reviewSession?.queueNodeIds ?? [],
        soonNodeIds: payload.state.reviewSession?.soonNodeIds ?? []
      }
    };
  }, WORKSPACE_STORAGE_KEY);

  return {
    ...storageSnapshot,
    flowTitles: flowTitles.map((title) => title.trim()).filter(Boolean)
  };
}

async function polluteDemoLocalState(page: Page) {
  await page.evaluate((storageKey) => {
    const rawPayload = window.localStorage.getItem(storageKey);
    if (!rawPayload) throw new Error('Demo workspace payload was not stored.');

    const payload = JSON.parse(rawPayload) as WorkspacePayload;
    Object.values(payload.state.nodesById).forEach((node) => {
      if (node.reading) {
        node.reading = { ...node.reading, repetitionCount: 99, state: 'dismissed' };
      }
      if (node.review) {
        node.review = { ...node.review, lapses: 9, lastReviewAt: new Date().toISOString(), reps: 99, state: 2 };
      }
    });
    payload.state.reviewSession = {
      ...payload.state.reviewSession,
      currentNodeId: null,
      isAnswerRevealed: true,
      queueNodeIds: [],
      soonNodeIds: Object.keys(payload.state.nodesById).slice(0, 2)
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    window.localStorage.setItem('foliole-demo-preview-day-v1', '4');
    window.localStorage.setItem('foliole-demo-started-at-v1', '2026-01-01T00:00:00.000Z');
  }, WORKSPACE_STORAGE_KEY);
}

test.skip(!DEMO_E2E_ENABLED, 'Demo reset e2e requires FOLIOLE_DEMO_E2E=1 and the Demo site base URL.');

test('reset data returns the Demo to its first-run learning state', async ({ page }) => {
  await clearDemoStorage(page);
  await page.goto('/en/demo/focused-reading-review/', { waitUntil: 'domcontentloaded' });
  await waitForDemoWorkspace(page);

  const firstRun = await readLearningSnapshot(page);
  expect(firstRun.flowTitles).toContain('Welcome to Foliole');
  await expect(page.getByText('Day 2')).toBeHidden();

  await polluteDemoLocalState(page);
  await page.reload();
  await waitForDemoWorkspace(page);

  await page.getByRole('button', { name: 'Reset data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset demo data?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset data' }).click();

  await expect(dialog).toBeHidden();
  await waitForDemoWorkspace(page);
  const afterReset = await readLearningSnapshot(page);
  expect(afterReset).toEqual(firstRun);
  await expect(page.getByText('Day 2')).toBeHidden();
});
