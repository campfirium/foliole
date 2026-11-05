import path from 'node:path';

import { expect, test } from '@playwright/test';

import { addFonts, openReader, renderedWidths } from '../fixtures/companionFontBrowser';

const weight = (page: import('@playwright/test').Page) => page.getByLabel('Font weight', { exact: true });

test('uses genuine imported font faces and restores heavier text after reload', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  await expect(weight(page)).toHaveAttribute('aria-busy', 'false');
  await expect(weight(page)).toHaveText('400');
  await addFonts(page, ['Bold']);
  await expect(page.getByRole('button', { name: 'Increase Font weight' })).toBeEnabled();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const initial = await renderedWidths(page);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(page.getByRole('button', { name: 'Increase Font weight' })).toBeEnabled();
  while (await page.getByRole('button', { name: 'Increase Font weight' }).isEnabled()) {
    await page.getByRole('button', { name: 'Increase Font weight' }).click();
  }
  await expect(weight(page)).toHaveText('700');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const heavy = await renderedWidths(page);
  expect(heavy[0]).toBeGreaterThan(initial[0]! * 1.5);
  expect(heavy[1]).toBeGreaterThanOrEqual(heavy[0]!);
  await page.reload();
  await expect.poll(() => renderedWidths(page)).toEqual(heavy);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(weight(page)).toHaveText('700');
  await weight(page).scrollIntoViewIfNeeded();
  const valueBox = (await weight(page).boundingBox())!;
  const minusBox = (await page.getByRole('button', { name: 'Decrease Font weight' }).boundingBox())!;
  const plusBox = (await page.getByRole('button', { name: 'Increase Font weight' }).boundingBox())!;
  expect(valueBox.x + valueBox.width).toBeLessThan(minusBox.x);
  expect(minusBox.x).toBeLessThan(plusBox.x);
  expect(Math.abs(valueBox.y + valueBox.height / 2 - minusBox.y - minusBox.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: '.tmp/artifacts/T697/weight-stepper.png' });
});

test('imports a real variable font and renders distinct intermediate Chinese and Latin glyphs', async ({ page }) => {
  await openReader(page);
  await page.locator('input[type=file]').setInputFiles(path.resolve('src/shared/assets/fonts/NotoSansSC-VF.ttf'));
  const confirm = page.getByRole('button', { name: 'Add fonts', exact: true });
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Increase Font weight' })).toBeEnabled();
  const samples: number[][] = [];
  for (const target of [400, 450, 500]) {
    if (target !== 400) await page.getByRole('button', { name: 'Increase Font weight' }).click();
    await expect(weight(page)).toHaveText(String(target));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontWeight)).toBe(target);
    samples.push(await page.locator('.cm-content').evaluate(async element => {
      await document.fonts.ready;
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 70;
      const context = canvas.getContext('2d')!;
      context.font = `${style.fontWeight} 32px ${style.fontFamily}`;
      return ['中文阅读', 'Foliole2026'].map(text => {
        context.clearRect(0, 0, 400, 70);
        context.fillText(text, 4, 48);
        return context.getImageData(0, 0, 400, 70).data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
      });
    }));
  }
  for (const index of [0, 1]) {
    expect(samples[1]![index]).toBeGreaterThan(samples[0]![index]!);
    expect(samples[2]![index]).toBeGreaterThan(samples[1]![index]!);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(weight(page)).toHaveText('500');
  await page.getByRole('button', { name: 'Serif', exact: true }).click();
  await expect(weight(page)).toHaveText('400');
});
