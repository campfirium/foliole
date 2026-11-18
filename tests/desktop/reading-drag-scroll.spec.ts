import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('extends a Markdown reading selection while held at the bottom edge', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    const content = Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} gives the reader more text to select.`).join('\n\n');
    await api.seedNodes([{ id: 'reading-drag-scroll', kind: 'topic', title: 'Long article', content }], { persist: true });
    await api.openNode('reading-drag-scroll');
  });
  const scroller = page.locator('.prompt-editor-host .cm-scroller');
  const line = scroller.getByText('Paragraph 1 gives the reader more text to select.', { exact: true });
  await expect(line).toBeInViewport();
  const start = await line.boundingBox();
  const viewport = await scroller.boundingBox();
  if (!start || !viewport) throw new Error('Missing reading pane geometry');
  const x = start.x + 2;
  const readSelection = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  const scrollTop = () => scroller.evaluate(element => element.scrollTop);
  const before = await scrollTop();
  await page.mouse.move(x, start.y + start.height / 3);
  await page.mouse.down();
  try {
    const bottom = Math.min(viewport.y + viewport.height, await page.evaluate(() => innerHeight));
    await page.mouse.move(x, bottom - 32, { steps: 12 });
    const selected = await readSelection();
    expect(selected).toContain('Paragraph');
    await page.mouse.move(x, bottom - 12, { steps: 6 });
    await expect.poll(scrollTop).toBeGreaterThan(before + 45);
    await expect.poll(async () => (await readSelection()).length).toBeGreaterThan(selected.length + 50);
  } finally {
    await page.mouse.up();
  }
});
