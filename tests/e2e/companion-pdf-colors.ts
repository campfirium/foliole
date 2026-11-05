import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { pdfColorSample } from '../fixtures/pdfColorSample';

async function load(page: Page) {
  await page.goto('/__pdf-colors');
  await expect(page.getByRole('combobox', { name: 'PDF in dark mode' })).toBeVisible();
  const directory = path.resolve('dist/companion/assets');
  const stylesheet = readdirSync(directory).find(name => /^index-.*\.css$/.test(name));
  if (!stylesheet) throw new Error('Run npm run android:web:build before this test.');
  await page.locator('style').evaluateAll(styles => styles.forEach(style => style.remove()));
  for (const name of readdirSync(directory).filter(name => name.endsWith('.css'))) {
    await page.addStyleTag({ content: readFileSync(path.join(directory, name), 'utf8') });
  }
  await expect(page.locator('[data-pdf-page="2"] canvas')).toBeVisible();
  await expect(page.locator('[data-pdf-page="2"] canvas')).toHaveCSS('display', 'block');
}

async function routePdf(page: Page) {
  const bytes = pdfColorSample();
  await page.route('**/__color-sample.pdf', route => route.fulfill({ contentType: 'application/pdf', body: bytes }));
  await page.route('**/__pdf-colors', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionPdfColors.tsx');
    </script></body></html>` }));
  return bytes;
}

test('preserves real PDF layers, zoom and position while changing colors and restores the choice after reload', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const bytes = await routePdf(page);
  await load(page);
  const picker = page.getByRole('combobox', { name: 'PDF in dark mode' });
  const pdf = page.getByRole('region', { name: 'Color sample PDF reader' });
  const canvas = page.locator('[data-pdf-page="2"] canvas');
  const layer = page.locator('[data-pdf-page="2"] .react-pdf__Page');
  await expect(page.locator('[data-pdf-page="2"] .textLayer')).toContainText(/./);
  await expect(picker).toHaveValue('warm');
  await expect(canvas).toHaveCSS('filter', 'sepia(0.24) saturate(0.72) brightness(0.84) contrast(0.96)');
  await page.getByRole('button', { name: '+', exact: true }).click();
  await expect(page.getByText('120%', { exact: true })).toBeVisible();
  const scroll = page.locator('.pdf-document-surface > .overflow-auto');
  await expect(page.locator('[data-pdf-page="2"] > div').last()).toHaveAttribute('style', /height:/);
  await scroll.dispatchEvent('wheel');
  await scroll.evaluate(async element => {
    element.scrollTop += 30;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const position = await scroll.evaluate(element => element.scrollTop);
  const originalPixels = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
  await canvas.evaluate(element => { element.dataset.testIdentity = 'same-canvas'; });
  await picker.selectOption('inverted');
  await expect(layer).toHaveCSS('filter', 'invert(0.94) hue-rotate(180deg) brightness(0.92) contrast(0.92)');
  await expect(canvas).toHaveCSS('filter', 'none');
  await picker.selectOption('original');
  await expect(layer).toHaveCSS('filter', 'none');
  await picker.selectOption('warm');
  await expect(canvas).toHaveAttribute('data-test-identity', 'same-canvas');
  expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).toBe(originalPixels);
  await expect(page.locator('[data-pdf-page="2"] .annotationLayer a')).toHaveAttribute('href', 'https://example.org/pdf-sample');
  expect(await scroll.evaluate(element => element.scrollTop)).toBeCloseTo(position, 0);
  await expect(page.getByText('120%', { exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(canvas).toHaveCSS('filter', 'none');
  await expect(picker).toHaveValue('warm');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(canvas).not.toHaveCSS('filter', 'none');
  await page.screenshot({ path: '.tmp/artifacts/T700/pdf-warm.png', fullPage: true });
  await picker.selectOption('inverted');
  await page.getByRole('button', { name: 'Another PDF', exact: true }).click();
  await expect(layer).toHaveCSS('filter', 'invert(0.94) hue-rotate(180deg) brightness(0.92) contrast(0.92)');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(canvas).toHaveCount(0);
  await page.getByRole('button', { name: 'Reopen PDF', exact: true }).click();
  await expect(canvas).toBeVisible();
  await load(page);
  await expect(picker).toHaveValue('inverted');
  await expect(layer).toHaveCSS('filter', 'invert(0.94) hue-rotate(180deg) brightness(0.92) contrast(0.92)');
  expect(await picker.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.locator('body').evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.tmp/artifacts/T700/pdf-inverted.png', fullPage: true });
  expect(await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch('/__color-sample.pdf')).arrayBuffer())))).toEqual([...bytes]);
  await expect(pdf).toBeVisible();
});
