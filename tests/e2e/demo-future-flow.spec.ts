import { expect, test } from '@playwright/test';

// SKIP: requires explicit Demo e2e environment | 2026-10-28 | revive: run with FOLIOLE_DEMO_E2E=1 and a Demo site base URL
test.skip(process.env.FOLIOLE_DEMO_E2E !== '1', 'Requires the Demo preview.');

test('previews a handled topic once and learns it only after advancing the simulated day', async ({ page }) => {
  await page.goto('/en/demo/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('foliole-workspace-v1')!).state);
  await expect(page.getByRole('button', { name: /^Enter Flow$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const before = await state();
  const id = before.reviewSession.currentNodeId;
  const title = before.nodesById[id].title;
  await page.getByRole('button', { name: /^Read$/ }).click();
  await expect.poll(async () => (await state()).reviewSession.readTopicCount).toBe(1);
  const future = page.locator('ol[aria-label="Flow items"]').getByRole('button', { name: title, exact: true });
  await expect(future).toHaveCount(1);
  await expect(page.locator('ol[aria-label="Flow items"]').getByText('Day 2', { exact: true })).toBeVisible();
  const after = await state();
  await future.click();
  expect((await state()).reviewSession).toEqual(after.reviewSession);
  expect((await state()).nodesById[id].reading).toEqual(after.nodesById[id].reading);
  await page.getByRole('button', { name: /^Resume review$/ }).click();
  const dialog = page.getByRole('dialog');
  for (let attempt = 0; attempt < 20 && !(await dialog.isVisible()); attempt += 1) {
    const prior = (await state()).reviewSession.readTopicCount;
    await page.getByRole('button', { name: /^Read$/ }).click();
    await expect.poll(async () => (await state()).reviewSession.readTopicCount).toBe(prior + 1);
  }
  await expect(dialog).toContainText('All clear for Day 1.');
  const cleared = await state();
  await dialog.getByRole('button', { name: 'Simulate Day 2', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Read$/ })).toBeVisible();
  await expect.poll(async () => (await state()).browserDailyFlow.state.day_key).not.toBe(cleared.browserDailyFlow.state.day_key);
  expect((await state()).nodesById[id].reading).toEqual(cleared.nodesById[id].reading);
  expect((await state()).reviewSession.readTopicCount).toBe(0);
  await page.screenshot({ path: '.tmp/artifacts/T536/browser-next-day.png', fullPage: true });
});
