import { mkdir } from 'node:fs/promises';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function dragPreviewScrollbar(page: Page, scrollArea: Locator) {
  const bounds = (await scrollArea.boundingBox())!;
  const beforeDrag = await scrollArea.evaluate(({ clientWidth, offsetWidth, scrollHeight, scrollTop }) => ({
    width: offsetWidth - clientWidth,
    fraction: scrollTop / scrollHeight,
    scrollTop
  }));
  const x = bounds.x + bounds.width - Math.max(3, beforeDrag.width / 2);
  const y = bounds.y + beforeDrag.fraction * bounds.height + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeDrag.scrollTop);
}

for (const width of [1600, 1000]) {
  test(`keeps the linked topic preview open during scrolling at ${width}px`, async ({ desktopWindow: page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await expectWorkspaceShell(page);
    await page.evaluate(async () => {
      const api = window.__folioleWorkspaceDebug;
      await api?.seedNodes?.([
        { id: 'preview-source', kind: 'topic', title: 'Preview source', content: '\n\n[[Preview target]]' },
        {
          id: 'preview-target',
          kind: 'topic',
          title: 'Preview target',
          content: Array.from({ length: 120 }, (_, index) => `Preview paragraph ${index + 1}`).join('\n\n')
        }
      ]);
      await api?.openNode?.('preview-source');
    });

    const link = page.locator('.prompt-editor-host [data-md-link-node-title="Preview target"]');
    await link.hover();
    const artifactDir = '.tmp/artifacts/T788';
    await mkdir(artifactDir, { recursive: true });
    const preview = page.locator('section[aria-label="Linked topic preview"], section[aria-label="链接主题预览"]');
    const content = preview.locator('pre');
    await expect(content).toContainText('Preview paragraph 120');
    const anchor = (await link.boundingBox())!;
    const panel = (await preview.boundingBox())!;
    const x = Math.max(panel.x + 20, Math.min(anchor.x + anchor.width / 2, panel.x + panel.width - 20));
    const y = Math.max(panel.y + 12, Math.min(anchor.y + anchor.height / 2, panel.y + panel.height - 12));
    await page.mouse.move(x, y, { steps: 24 });
    await expect(preview).toBeVisible();

    const scrollArea = content.locator('..');
    await page.mouse.move(panel.x + panel.width / 2, panel.y + Math.min(100, panel.height - 12));
    await page.mouse.wheel(0, 360);
    await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await dragPreviewScrollbar(page, scrollArea);
    await expect(preview.getByText('Preview target', { exact: true })).toBeInViewport();

    await page.screenshot({ path: `${artifactDir}/node-link-hover-preview-${width}.png` });
    await page.mouse.move(4, 4, { steps: 16 });
    await expect(preview).toBeHidden();
  });
}
