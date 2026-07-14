import {
  attachGoldenEvidence,
  chooseDarkAppearance,
  collectGoldenState,
  createGoldenTopic,
  exitFlowIfNeeded,
  expectDarkAppearance,
  GOLDEN_CONTENT,
  GOLDEN_NEEDLE,
  openGoldenTopic,
  openGuidedSample,
  readCurrentFlowTopic,
  relaunchGoldenJourney,
  scrollGoldenTopic,
  searchGoldenTopic
} from './harness/core-product-golden-journey';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type JourneyCheckpoint = {
  reviewedNodeId: string;
  reviewedReading: { nextAt: string; state: string } | null;
  topicId: string;
};

async function runFirstSession(session: DesktopSession, testInfo: Parameters<typeof attachGoldenEvidence>[1]) {
  const page = session.firstWindow;
  let topicId = '';
  await expectWorkspaceShell(page);
  const reviewed = await test.step('complete one reading review action', () => readCurrentFlowTopic(page));
  await test.step('create, edit, and navigate without cross-wiring content', async () => {
    await exitFlowIfNeeded(page);
    topicId = await createGoldenTopic(page);
    await openGuidedSample(page);
    await openGoldenTopic(page, topicId);
    expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.content, topicId))
      .toBe(GOLDEN_CONTENT);
  });
  await test.step('find the deep body match through workspace search', async () => {
    await searchGoldenTopic(page, topicId);
  });
  await test.step('capture a durable reading position', async () => {
    const state = await scrollGoldenTopic(page, topicId);
    expect(state.scrollTop).toBeGreaterThan(0);
    expect(state.viewState?.scrollTop).toBeGreaterThan(0);
  });
  await test.step('select and apply the permanent dark appearance', async () => {
    await chooseDarkAppearance(page);
    await exitFlowIfNeeded(page);
    await openGoldenTopic(page, topicId);
    const before = await collectGoldenState(page, topicId);
    expect(before).toMatchObject({ activeNodeId: topicId, resolvedBaseColor: 'dark' });
    expect(before.scrollTop).toBeGreaterThan(0);
    expect(before.viewState?.scrollTop).toBeGreaterThan(0);
    await attachGoldenEvidence(page, testInfo, 'macos-core-golden-before-relaunch', {
      stateRoot: session.launchOptions.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT,
      topicId, reviewedNodeId: reviewed.nodeId, reviewedReading: reviewed.reading, state: before
    });
  });
  return { topicId, reviewedNodeId: reviewed.nodeId, reviewedReading: reviewed.reading };
}

async function verifySecondSession(session: DesktopSession, checkpoint: JourneyCheckpoint, testInfo: Parameters<typeof attachGoldenEvidence>[1]) {
  const { reviewedNodeId, reviewedReading, topicId } = checkpoint;
  const page = session.firstWindow;
  await test.step('restore content, reading, review, appearance, and search', async () => {
    await expect.poll(() => collectGoldenState(page, topicId)).toMatchObject({
      activeNodeId: topicId, resolvedBaseColor: 'dark', scrollTop: expect.any(Number),
      viewState: { scrollTop: expect.any(Number) }
    });
    const restored = await collectGoldenState(page, topicId);
    expect(restored.scrollTop).toBeGreaterThan(0);
    expect(restored.viewState?.scrollTop).toBeGreaterThan(0);
    expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.content, topicId))
      .toBe(GOLDEN_CONTENT);
    expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.reading, reviewedNodeId))
      .toEqual(reviewedReading);
    await expectDarkAppearance(page);
    await openGuidedSample(page);
    await searchGoldenTopic(page, topicId);
    await expect(page.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ }))
      .toContainText(GOLDEN_NEEDLE);
    await attachGoldenEvidence(page, testInfo, 'macos-core-golden-after-relaunch', {
      topicId, reviewedNodeId, reviewedReading, restored: await collectGoldenState(page, topicId)
    });
  });
}

test('keeps the macOS core product journey intact across a full relaunch', async ({ desktopSession }, testInfo) => {
  let secondSession: DesktopSession | null = null;
  try {
    const checkpoint = await runFirstSession(desktopSession, testInfo);
    await test.step('relaunch the same isolated state root', async () => {
      secondSession = await relaunchGoldenJourney(desktopSession);
      await expectWorkspaceShell(secondSession.firstWindow);
    });
    await verifySecondSession(secondSession, checkpoint, testInfo);
  } finally {
    await secondSession?.close();
  }
});
