import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { importPdf } from './pdf-image-excerpt-test-support';

test('PDF inverted reading has no bright page edge after theme switches @pdf', async ({ desktopApp, desktopWindow }) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-base-color', 'dark');
    window.localStorage.setItem('foliole-pdf-reading-mode', 'inverted');
  });
  await desktopWindow.reload();
  await expect(desktopWindow.locator('main[aria-label]').first()).toBeVisible();
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await importPdf(desktopApp, desktopWindow, path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf'));
  const page = desktopWindow.locator('.react-pdf__Page').first();
  const root = desktopWindow.locator('html');
  await expect(root).toHaveAttribute('data-resolved-base-color', 'dark');
  await expect(root).toHaveAttribute('data-pdf-reading-mode', 'inverted');
  await expect(page).toHaveCSS('box-shadow', 'none');
  await expect(page).toHaveCSS('filter', /invert/);
  await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels?.some((channel, index) => index % 4 === 0 && channel < 100) ?? false;
  })).toBe(true);
  const heading = page.getByText('Foliole PDF User Journey Page 1 alpha keyword', { exact: true });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-page-edge-dark.png') });

  const toggle = desktopWindow.getByRole('button', { name: /^(Appearance mode:|外观模式：)/ });
  await toggle.click();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'light');
  await expect(page).toHaveCSS('filter', 'none');
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-page-edge-light.png') });
  await toggle.click();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'dark');
  await expect(page).toHaveCSS('box-shadow', 'none');
  await expect(page).toHaveCSS('filter', /invert/);
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-page-edge-restored-dark.png') });
});
