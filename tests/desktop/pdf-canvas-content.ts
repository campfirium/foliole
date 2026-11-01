import type { Locator } from '@playwright/test';

import { expect } from './harness/fixtures';

export async function capturePdfSurface(surface: Locator, path: string) {
  await expect.poll(() => surface.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) return false;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let darkest = 255;
    let lightest = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) continue;
      const light = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      darkest = Math.min(darkest, light);
      lightest = Math.max(lightest, light);
    }
    return lightest - darkest > 30;
  }), { timeout: 15000 }).toBe(true);
  await expect(surface.locator('canvas').first()).toBeVisible();
  await surface.locator('canvas').first().screenshot({ path: path.replace('.png', '-canvas.png') });
  await surface.screenshot({ path });
}
