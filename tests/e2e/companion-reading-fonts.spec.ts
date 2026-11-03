import path from 'node:path';

import { expect, test } from '@playwright/test';

import { addFonts, openReader, renderedWidths } from '../fixtures/companionFontBrowser';

test('uses real regular, bold, italic and bold italic faces of one imported family after restart', async ({ page }) => {
  await openReader(page);
  // Sequential import also works with the old single-file picker: fail on the rendered result.
  for (const style of ['Regular', 'Bold', 'Italic', 'BoldItalic']) await addFonts(page, [style]);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(async () => {
    const [regular, bold, italic, boldItalic] = await renderedWidths(page);
    return bold > regular * 1.5 && italic > regular * 1.2 && boldItalic > bold;
  }).toBe(true);
  const widths = await renderedWidths(page);
  await page.screenshot({ path: '.tmp/artifacts/T702/font-family-reading.png' });
  await page.reload();
  await expect.poll(() => renderedWidths(page)).toEqual(widths);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(page.getByRole('button', { name: 'Foliole Test Reading', exact: true })).toHaveCount(1);
});

test('imports a batch as one family, skips duplicates and cancels without changes', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular', 'Bold', 'Italic', 'BoldItalic']);
  const family = page.getByRole('button', { name: 'Foliole Test Reading', exact: true });
  await expect(family).toHaveAttribute('aria-pressed', 'true');
  await addFonts(page, ['Bold']);
  await expect(family).toHaveCount(1);
  expect(await page.evaluate(() => Array.from(document.fonts).filter(face =>
    face.family.startsWith('FolioleReadingFont_')).length)).toBe(4);
  await page.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/fonts/Reading-Regular.otf'));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(family).toHaveCount(1);
});

test('uses the actual variable weight range and produces distinct real glyphs', async ({ page }) => {
  await openReader(page);
  await page.locator('input[type=file]').setInputFiles(path.resolve('src/shared/assets/fonts/NotoSansSC-VF.ttf'));
  await page.getByRole('button', { name: 'Add fonts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Noto Sans SC', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const ink = await page.locator('.cm-content').evaluate(async element => {
    await document.fonts.ready;
    const family = getComputedStyle(element).fontFamily;
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 90;
    const context = canvas.getContext('2d')!;
    return [400, 500, 700].map(weight => {
      context.clearRect(0, 0, 200, 90); context.font = `${weight} 48px ${family}`;
      context.fillText('阅读Aa', 0, 60);
      return context.getImageData(0, 0, 200, 90).data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
    });
  });
  expect(ink[1]!).toBeGreaterThan(ink[0]!);
  expect(ink[2]!).toBeGreaterThan(ink[1]!);
  const weights = await page.evaluate(() => Array.from(document.fonts)
    .filter(face => face.family.startsWith('FolioleReadingFont_')).map(face => face.weight));
  expect(weights).toEqual(['100 900']);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts)
    .filter(face => face.family.startsWith('FolioleReadingFont_')).map(face => face.weight))).toEqual(weights);
});


test('does not partially import a batch containing a broken font', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  await page.locator('input[type=file]').setInputFiles([
    { name: 'Italic.otf', mimeType: 'font/otf', buffer: (await import('node:fs')).readFileSync('tests/fixtures/fonts/Reading-Italic.otf') },
    { name: 'Broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('broken') }
  ]);
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => Array.from(document.fonts).filter(face =>
    face.family.startsWith('FolioleReadingFont_')).map(face => face.style))).toEqual(['normal']);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts).filter(face =>
    face.family.startsWith('FolioleReadingFont_')).map(face => face.style))).toEqual(['normal']);
});

test('keeps the existing family when a real IndexedDB transaction aborts, then retries', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  const selection = await page.evaluate(() => localStorage.getItem('foliole-companion-reading-typography-settings'));
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let abortNext = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args);
      if (abortNext && this.name === 'fonts') { abortNext = false; this.transaction.abort(); }
      return request;
    };
  });
  await page.locator('input[type=file]').setInputFiles(path.resolve('src/shared/assets/fonts/NotoSansSC-VF.ttf'));
  await page.getByRole('button', { name: 'Add fonts', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('foliole-companion-reading-typography-settings'))).toBe(selection);
  expect(await page.evaluate(() => Array.from(document.fonts).filter(face =>
    face.family.startsWith('FolioleReadingFont_')).map(face => face.weight))).toEqual(['400']);
  await page.getByRole('button', { name: 'Add fonts', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts).filter(face =>
    face.family.startsWith('FolioleReadingFont_')).map(face => face.weight))).toEqual(['400', '100 900']);
});

test('restores old single-file bytes and selection without rewriting the record', async ({ page }) => {
  await openReader(page);
  const { seedLegacyFont } = await import('../fixtures/companionFontBrowser');
  const id = await seedLegacyFont(page);
  const widths = await renderedWidths(page);
  expect(widths.every(width => width === widths[0])).toBe(true);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(page.getByRole('button', { name: 'Old reader', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily))
    .toBe(`custom:${id}`);
  const records = await page.evaluate(async () => {
    const modulePath = '/src/shared/platform/readingFontStorage.ts';
    const { readFontRecords } = await import(modulePath);
    return (await readFontRecords()).map((record: { id: string; data: ArrayBuffer }) => ({
      id: record.id, keys: Object.keys(record).sort(), size: record.data.byteLength
    }));
  });
  expect(records).toEqual([{ id, keys: ['data', 'id', 'name'], size: (await import('node:fs')).statSync('tests/fixtures/fonts/Reading-Regular.otf').size }]);
});
