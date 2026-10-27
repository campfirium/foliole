import { expect, test, type Page } from '@playwright/test';

const key = 'foliole-workspace-v1';
type Saved = { reviewSession: { currentNodeId: string | null; sessionStartedAt?: string | null; readTopicCount?: number };
  nodesById: Record<string, { reading?: { repetitionCount: number } | null }>;
  appActionHistory: { undoStack: unknown[] }; browserDailyFlow: { state: { session: Saved['reviewSession'] } } };
const saved = (page: Page) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!).state as Saved, key);

async function openFreshDemo(page: Page) {
  await page.goto('/en/demo/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByLabel('Foliole workspace')).toBeVisible();
  await expect(page.locator('ol[aria-label="Flow items"] button', { hasText: 'Welcome to Foliole' })).toBeVisible();
}

// SKIP: requires explicit Demo e2e environment | 2026-10-28 | revive: run with FOLIOLE_DEMO_E2E=1 and a Demo site base URL
test.skip(process.env.FOLIOLE_DEMO_E2E !== '1', 'Requires the Demo preview.');

test('prepares without starting and restores the saved daily successor after a browser reload', async ({ page }) => {
  await openFreshDemo(page);
  expect((await saved(page)).browserDailyFlow.state.session.sessionStartedAt).toBeNull();
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const target = (await saved(page)).reviewSession.currentNodeId!;
  const priorCount = (await saved(page)).nodesById[target]!.reading?.repetitionCount ?? 0;
  await page.getByRole('button', { name: /^Read$/ }).click();
  await expect.poll(async () => (await saved(page)).nodesById[target]!.reading?.repetitionCount).toBe(priorCount + 1);
  const committed = await saved(page);
  expect(committed.reviewSession.currentNodeId).not.toBe(target);
  expect(committed.appActionHistory.undoStack).toHaveLength(1);
  await page.screenshot({ path: '.tmp/artifacts/T536/browser-after-read.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: /^Exit Flow$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeVisible();
  await expect.poll(async () => (await saved(page)).reviewSession.currentNodeId).toBe(committed.reviewSession.currentNodeId);
  expect((await saved(page)).reviewSession.readTopicCount).toBe(1);
  await page.screenshot({ path: '.tmp/artifacts/T536/browser-reloaded.png', fullPage: true });
});

test('keeps the displayed task when a browser save fails and retries the Read once', async ({ page }) => {
  await openFreshDemo(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const before = await saved(page);
  const target = before.reviewSession.currentNodeId!;
  const raw = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);
  await page.evaluate(storageKey => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === storageKey) {
        Storage.prototype.setItem = original;
        document.documentElement.dataset.saveRejected = 'true';
        throw new DOMException('Fixture storage is full.', 'QuotaExceededError');
      }
      return original.call(this, name, value);
    };
  }, key);
  await page.getByRole('button', { name: /^Read$/ }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.saveRejected)).toBe('true');
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe(raw);
  expect((await saved(page)).reviewSession.currentNodeId).toBe(target);
  await page.getByRole('button', { name: /^Read$/ }).click();
  await expect.poll(async () => (await saved(page)).reviewSession.readTopicCount).toBe(1);
  expect((await saved(page)).appActionHistory.undoStack).toHaveLength(1);
});
