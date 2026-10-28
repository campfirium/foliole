import { expect, test, type Page } from '@playwright/test';

// SKIP: requires explicit Demo e2e environment | 2026-10-28 | revive: run with FOLIOLE_DEMO_E2E=1 and a Demo site base URL
test.skip(process.env.FOLIOLE_DEMO_E2E !== '1', 'Requires the Demo preview.');
const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('foliole-workspace-v1')!).state);

async function openFixture(page: Page, cloze = false) {
  await page.goto('/en/demo/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: /^Enter Flow$/ })).toBeVisible();
  const seeded = await page.evaluate(hasCloze => {
    const saved = JSON.parse(localStorage.getItem('foliole-workspace-v1')!);
    const s = saved.state;
    const qa = 'demo-what-the-foliole-demo-is-for';
    const reading = 'demo-welcome-to-foliole';
    const clozeId = 'demo-welcome-to-foliole.reading-break-the-whole-into-pieces';
    const stamp = new Date(Date.now() - 86400000).toISOString();
    for (const node of Object.values(s.nodesById) as { kind: string; shelvedAt?: string }[]) {
      if (node.kind === 'topic' || node.kind === 'item') node.shelvedAt = stamp;
    }
    const update = (id: string, item: boolean, title: string) => {
      s.nodesById[id] = { ...s.nodesById[id], kind: item ? 'item' : 'topic', title, content: `Body ${id}`,
        reveal: item ? `Answer ${id}` : null, reading: null, review: null, shelvedAt: null,
        anchorLink: null, hasContent: true, hasReveal: item, createdAt: stamp, updatedAt: stamp };
    };
    update(qa, true, 'Review prompt'); update(reading, false, 'Reading passage');
    if (hasCloze) { update(clozeId, true, 'Cloze prompt'); s.nodesById[clozeId].anchorLink = { id: 'anchor', kind: 'cloze' }; }
    s.activeNodeId = qa;
    s.reviewSession = { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0,
      sessionStartedAt: null, currentItemStartedAt: null, readTopicCount: 0, reviewedItemCount: 0,
      readingElapsedMs: 0, reviewElapsedMs: 0 };
    s.browserDailyFlow = { state: null, rows: [], operations: {}, readingDays: {}, reviewBases: {}, reviewEvents: {}, legacyHistoryIds: [] };
    s.reviewSessionMode = 'recommended'; s.reviewSessionModeExpiresAt = null;
    return { raw: JSON.stringify(saved), qa, reading };
  }, cloze);
  await page.addInitScript(raw => localStorage.setItem('foliole-workspace-v1', raw), seeded.raw);
  await page.reload();
  await expect(page.getByLabel('Foliole workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Enter Flow$/ })).toBeVisible();
  return seeded;
}

test('shows all durable eligible titles including cloze in the sidebar', async ({ page }) => {
  await openFixture(page, true);
  const list = page.getByRole('list', { name: 'Flow items' });
  for (const title of ['Review prompt', 'Cloze prompt', 'Reading passage']) {
    await expect(list.getByRole('button', { name: title, exact: true })).toHaveCount(1);
  }
  expect((await state(page)).browserDailyFlow.state.session.sessionStartedAt).toBeNull();
});

test('switches from grading to reading after the saved review action', async ({ page }) => {
  const ids = await openFixture(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: 'Show Answer', exact: true }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeVisible();
  expect((await state(page)).reviewSession.currentNodeId).toBe(ids.reading);
  expect((await state(page)).nodesById[ids.qa].review.reps).toBe(1);
});

test('pauses after history or sidebar navigation and resumes the saved current', async ({ page }) => {
  const ids = await openFixture(page);
  const list = page.getByRole('list', { name: 'Flow items' });
  await list.getByRole('button', { name: 'Reading passage', exact: true }).click();
  await list.getByRole('button', { name: 'Review prompt', exact: true }).click();
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('group', { name: 'Document navigation actions' }).first().getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume review', exact: true })).toBeVisible();
  expect((await state(page)).activeNodeId).toBe(ids.reading);
  expect((await state(page)).reviewSession.currentNodeId).toBe(ids.qa);
  await page.getByRole('button', { name: 'Resume review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show Answer', exact: true })).toBeVisible();
  expect((await state(page)).activeNodeId).toBe(ids.qa);
  await list.getByRole('button', { name: 'Reading passage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume review', exact: true })).toBeVisible();
  expect((await state(page)).activeNodeId).toBe(ids.reading);
  expect((await state(page)).reviewSession.currentNodeId).toBe(ids.qa);
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeHidden();
});
