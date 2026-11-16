import fs from 'node:fs';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { cycleRailAppearanceTo } from './appearance-mode-rail-support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedImageCloze(page: Page) {
  const bytesBase64 = fs.readFileSync('assets/brand/foliole-leaf-tight.png').toString('base64');
  await page.evaluate(async bytes => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([{ id: 'opacity-source', kind: 'topic', title: 'Image source', content: '' }]);
    const attachmentId = await debug.importClipboardImageAttachment({
      bytesBase64: bytes, mimeType: 'image/png', nodeId: 'opacity-source'
    });
    if (!attachmentId) throw new Error('Missing image attachment');
    const region = { id: 'opacity-region', x: 0.15, y: 0.15, width: 0.7, height: 0.7 };
    const content = `![Recall image](asset://${attachmentId}.png)`;
    const imageRegions = [{ attachmentId, regions: [region] }];
    await debug.seedNodes([
      { id: 'opacity-source', kind: 'topic', title: 'Image source', content, imageRegions },
      { id: 'opacity-item', parentNodeId: 'opacity-source', kind: 'item', title: 'Image recall',
        content, reveal: content, imageRegions,
        anchorLink: { id: region.id, kind: 'cloze', locator: { attachmentId, ...region } } }
    ]);
    await debug.openNode('opacity-item');
  }, bytesBase64);
}

async function expectOpaque(region: Locator) {
  await expect(region).toBeVisible();
  const colors = await region.evaluate(element => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const alpha = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    };
    return { background: alpha(style.backgroundColor), border: alpha(style.borderTopColor), opacity: style.opacity };
  });
  expect(colors).toEqual({ background: 255, border: 255, opacity: '1' });
}

test('fully conceals image clozes in both themes without covering the answer', async ({ desktopWindow: page }) => {
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await seedImageCloze(page);
  const output = path.resolve('.tmp/artifacts/T787');
  fs.mkdirSync(output, { recursive: true });
  for (const theme of ['dark', 'light'] as const) {
    await cycleRailAppearanceTo(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-resolved-base-color', theme);
    const mask = page.locator('.cm-md-image-cloze-region[data-region-state="hidden"]').first();
    await expectOpaque(mask);
    await page.screenshot({ path: path.join(output, `${theme}-prompt.png`) });
    await page.locator('.cm-md-image-surface').first().hover();
    await page.locator('.cm-md-image-preview-trigger').first().click();
    const preview = page.getByRole('dialog');
    await expectOpaque(preview.locator('.cm-md-image-cloze-region[data-region-state="hidden"]'));
    await page.screenshot({ path: path.join(output, `${theme}-preview.png`) });
    await page.keyboard.press('Escape');
  }
  const answer = page.locator('.cm-md-image-cloze-region[data-region-state="outlined"]').first();
  await expect(answer).toBeVisible();
  await expect(answer).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: path.join(output, 'revealed-answer.png') });
});
