import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

async function openFixture(page: import('@playwright/test').Page) {
  page.on('pageerror', error => console.error(error));
  await page.route('**/__file-import', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    await import('/@fs/${process.cwd()}/tests/fixtures/companionFileImport.tsx');
    </script></body></html>` }));
  await page.goto('/__file-import');
}

test('file selection imports HTML, reports unavailable images and retains the separate draft', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Open capture' }).click();
  await page.getByRole('textbox', { name: 'Capture text' }).fill('Keep my separate draft');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload File' }).click();
  await (await choosing).setFiles({ name: 'source.html', mimeType: 'text/html',
    buffer: Buffer.from('<h1>Mobile file import</h1><p>Readable imported text</p><img src="figure.png" alt="Figure">') });
  await expect(page.getByRole('dialog', { name: 'Capture', exact: true })).not.toBeVisible();
  await expect(page.getByRole('article', { name: 'Imported topic' })).toContainText('Readable imported text');
  const warning = page.getByRole('alert');
  await expect(warning).toContainText('Text imported. Some local images');
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await page.locator('.companion-sheet-overlay').waitFor({ state: 'detached' });
  await page.screenshot({ path: '.tmp/artifacts/T645-2/formatted-import-image-notice.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(warning).not.toBeVisible();
  await page.getByRole('button', { name: 'Open capture' }).click();
  await expect(page.getByRole('textbox', { name: 'Capture text' })).toHaveValue('Keep my separate draft');
  await page.screenshot({ path: '.tmp/artifacts/T645-2/formatted-import-draft-retained.png', animations: 'disabled' });
});

test('a selected PDF opens in the existing original reader without clearing the text draft', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Open capture' }).click();
  await page.getByRole('textbox', { name: 'Capture text' }).fill('Keep the PDF draft');
  await page.getByLabel('Upload File', { exact: true }).setInputFiles('tests/desktop/fixtures/pdf-user-journey.pdf');
  await expect(page.getByRole('dialog', { name: 'Capture', exact: true })).not.toBeVisible();
  const renderedPage = page.locator('[data-pdf-page="1"] canvas');
  await expect(renderedPage).toBeVisible();
  await expect(page.getByRole('article', { name: 'Imported topic' })).toContainText('Foliole PDF User Journey Page 3 gamma keyword');
  await expect(page.locator('.react-pdf__Page__textContent').first()).toContainText('Foliole');
  await page.locator('.companion-sheet-overlay').waitFor({ state: 'detached' });
  await page.screenshot({ path: '.tmp/artifacts/T645-2/pdf-original-reader.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Open capture' }).click();
  await expect(page.getByRole('textbox', { name: 'Capture text' })).toHaveValue('Keep the PDF draft');
});
