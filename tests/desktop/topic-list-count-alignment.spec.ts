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

test('an EPUB book shows its total even when its chapters are collapsed', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const chapter = 'node-epub-0123456789abcdef01234567';
    const section = 'node-epub-1123456789abcdef01234567';
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'count-book', kind: 'topic', title: 'Counted book', content: '' },
      { id: chapter, kind: 'topic', parentNodeId: 'count-book', title: 'Chapter', content: 'A marked passage.' },
      { id: section, kind: 'topic', parentNodeId: chapter, title: 'Section', content: 'Section body.' },
      { id: 'count-highlight', kind: 'topic', parentNodeId: chapter, title: 'Highlight', content: 'marked',
        anchorLink: { id: 'book-highlight', kind: 'highlight', locator: { from: 2, to: 8, originalText: 'marked' } } },
      { id: 'count-section-card', kind: 'item', parentNodeId: section, title: 'Card', content: 'Question', reveal: 'Answer' },
      { id: 'count-nested-card', kind: 'item', parentNodeId: 'count-highlight', title: 'Nested card', content: 'Question', reveal: 'Answer' }
    ]);
  });

  const book = page.getByRole('treeitem', { name: 'Counted book', exact: true });
  const chapter = page.getByRole('treeitem', { name: 'Chapter', exact: true });
  const total = book.getByText('3', { exact: true });
  const toggle = book.locator('[data-node-tree-chevron]');
  await expect(book).toHaveAttribute('aria-expanded', 'false');
  await expect(total).toBeVisible();

  await toggle.click();
  const chapterCount = chapter.getByText('1', { exact: true });
  await expect(chapterCount).toBeVisible();
  const bookRight = await total.evaluate((element) => element.getBoundingClientRect().right);
  const chapterRight = await chapterCount.evaluate((element) => element.getBoundingClientRect().right);
  expect(chapterRight).toBeCloseTo(bookRight, 0);
  await page.screenshot({ path: '.tmp/artifacts/book-material-count.png' });

  await toggle.click();
  await expect(chapter).toBeHidden();
  await expect(total).toBeVisible();
});
