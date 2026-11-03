import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { addFonts, openReader, renderedWidths, seedLegacyFont } from '../fixtures/companionFontBrowser';

test('adds bold to the same mounted reader and retains the family selection after restart', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  const editor = await page.locator('.cm-content').elementHandle();
  const selection = await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily);
  const initial = await renderedWidths(page);
  expect(initial[1]).toBe(initial[0]);
  await addFonts(page, ['Bold']);
  const final = await renderedWidths(page);
  expect(final[1]!).toBeGreaterThan(final[0]! * 1.5);
  expect(await editor!.evaluate(element => element.isConnected && element === document.querySelector('.cm-content'))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe(selection);
  await page.reload();
  await expect.poll(() => renderedWidths(page)).toEqual(final);
});

test('explicitly adds a sibling to an old single-file entry without changing its id or bytes', async ({ page }) => {
  await openReader(page);
  const id = await seedLegacyFont(page);
  const editor = await page.locator('.cm-content').elementHandle();
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.locator('details summary').click();
  await page.getByRole('button', { name: 'Add variants', exact: true }).click();
  await addFonts(page, ['Bold']);
  expect(await editor!.evaluate(element => element.isConnected)).toBe(true);
  const widths = await renderedWidths(page);
  expect(widths[1]!).toBeGreaterThan(widths[0]! * 1.5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe(`custom:${id}`);
  const digest = await page.evaluate(async () => {
    const modulePath = '/src/shared/platform/readingFontStorage.ts';
    const { readFontRecords } = await import(modulePath);
    const [record] = await readFontRecords();
    const bytes = await crypto.subtle.digest('SHA-256', record.data);
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  });
  expect(digest).toBe(createHash('sha256').update(readFileSync('tests/fixtures/fonts/Reading-Regular.otf')).digest('hex'));
  await page.reload();
  await expect.poll(() => renderedWidths(page)).toEqual(widths);
});

test('rejects overlapping faces without silently replacing the active regular face', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  const before = await renderedWidths(page);
  // This fixture has the same family/400 slot and different original glyph data.
  await page.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/fonts/Reading-ConflictingRegular.otf'));
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await renderedWidths(page)).toEqual(before);
  await page.reload();
  await expect.poll(() => renderedWidths(page)).toEqual(before);
});

test('rejects stale concurrent imports from two readers without losing the successful addition', async ({ page, context }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  const other = await context.newPage();
  await openReader(other);
  await other.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/fonts/Reading-Italic.otf'));
  await expect(other.getByRole('button', { name: 'Add fonts', exact: true })).toBeVisible();
  await addFonts(page, ['Bold']);
  await other.getByRole('button', { name: 'Add fonts', exact: true }).click();
  await expect(other.getByRole('alert')).toBeVisible();
  for (const reader of [page, other]) {
    await reader.reload();
    await expect.poll(() => reader.evaluate(() => Array.from(document.fonts)
      .filter(face => face.family.startsWith('FolioleReadingFont_')).map(face => `${face.weight}/${face.style}`).sort()))
      .toEqual(['400/normal', '700/normal']);
  }
});

test('groups by the typographic family when legacy family names differ by style', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['PreferredRegular', 'PreferredBold']);
  await expect(page.getByRole('button', { name: 'Foliole Preferred Family', exact: true })).toHaveCount(1);
  const widths = await renderedWidths(page);
  expect(widths[1]!).toBeGreaterThan(widths[0]! * 1.5);
});

test('saves multiple families without changing the current choice by file order', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  const selection = await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily);
  await addFonts(page, ['Bold', 'PreferredRegular']);
  await expect(page.getByRole('button', { name: 'Foliole Test Reading', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Foliole Preferred Family', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe(selection);
});
