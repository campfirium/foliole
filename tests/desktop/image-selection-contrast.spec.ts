import { expect, test } from './harness/fixtures';
import { seedImageSource } from './harness/imageClozeSource';

test('shows a drag outline on both dark and light image content', async ({ desktopWindow: page }) => {
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#202124';
    ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = '#fff';
    ctx.fillRect(300, 0, 300, 300);
    return canvas.toDataURL().split(',')[1]!;
  });
  await seedImageSource(page, 1, Buffer.from(image, 'base64'));
  const surface = page.locator('.cm-md-image-surface-block').first();
  await surface.hover();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('Expected source image');
  const start = { x: Math.round(bounds.x + bounds.width * 0.2), y: Math.round(bounds.y + bounds.height * 0.3) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.7, { steps: 8 });
  const frame = await page.screenshot({ path: '.tmp/artifacts/image-selection-during-drag.png', scale: 'css' });
  await page.mouse.up();

  const contrastBySide = await page.evaluate(async ({ imageData, y, xPositions }) => {
    const screen = new Image();
    screen.src = `data:image/png;base64,${imageData}`;
    await screen.decode();
    const canvas = document.createElement('canvas');
    canvas.width = screen.width;
    canvas.height = screen.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(screen, 0, 0);
    return xPositions.map(x => {
      const baseline = ctx.getImageData(x, y - 8, 1, 1).data[0]!;
      const edge = ctx.getImageData(x, y - 3, 32, 7).data;
      return edge.filter((value, index) => index % 4 === 0 && Math.abs(value - baseline) > 100).length;
    });
  }, {
    imageData: frame.toString('base64'),
    xPositions: [0.3, 0.6].map(ratio => Math.round(bounds.x + bounds.width * ratio)),
    y: start.y
  });
  expect(contrastBySide[0], 'outline over dark image content').toBeGreaterThan(20);
  expect(contrastBySide[1], 'outline over light image content').toBeGreaterThan(20);
});
