import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SHORT_TITLE = 'Short topic';
const LONG_TITLE = 'A long topic title with enough words to overflow the available width '.repeat(5).trim();

test('topic counts share a right edge while long titles truncate', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ([shortTitle, longTitle]) => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'count-short', kind: 'topic', title: shortTitle!, content: 'Short body.' },
      { id: 'count-long', kind: 'topic', title: longTitle!, content: 'Long body.' },
      { id: 'count-short-child', kind: 'item', parentNodeId: 'count-short', title: 'Short child', content: 'Child body.' },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `count-long-child-${index}`,
        kind: 'item' as const,
        parentNodeId: 'count-long',
        title: `Long child ${index}`,
        content: 'Child body.'
      }))
    ]);
  }, [SHORT_TITLE, LONG_TITLE] as const);

  const shortCount = page.getByRole('treeitem', { name: SHORT_TITLE, exact: true }).getByText('1', { exact: true });
  const longRow = page.getByRole('treeitem', { name: LONG_TITLE, exact: true });
  const longCount = longRow.getByText('12', { exact: true });
  await expect(shortCount).toBeVisible();
  await expect(longCount).toBeVisible();
  await page.screenshot({ path: '.tmp/artifacts/topic-list-count-alignment.png' });

  const shortRight = await shortCount.evaluate((element) => element.getBoundingClientRect().right);
  const longRight = await longCount.evaluate((element) => element.getBoundingClientRect().right);
  expect(shortRight).toBeCloseTo(longRight, 0);
  expect(await longRow.getByText(LONG_TITLE, { exact: true }).evaluate((element) =>
    element.scrollWidth > element.clientWidth && getComputedStyle(element).textOverflow === 'ellipsis'
  )).toBe(true);
});
