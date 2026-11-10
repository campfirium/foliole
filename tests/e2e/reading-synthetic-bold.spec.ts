import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

test('renders emphasis and headings in a font with only a regular face', async ({ page }) => {
  await page.route('https://foliole.test/font.ttf', route => route.fulfill({
    headers: { 'access-control-allow-origin': '*' },
    path: 'src/shared/assets/fonts/NotoSansSC-VF.ttf'
  }));
  await page.setContent('<div>Reading emphasis 阅读强调</div>');
  const styles = readFileSync('src/app/styles.css', 'utf8').replace(/^@import[^;]+;/gm, '');
  await page.addStyleTag({ content: styles });
  await page.addStyleTag({ content: `
    @font-face {
      font-family: ReadingFixture;
      src: url(https://foliole.test/font.ttf);
      font-weight: 400;
    }
    body { font: 400 32px/1.5 ReadingFixture; color: black; background: white; }
  ` });
  await page.evaluate(async () => {
    await document.fonts.load('32px ReadingFixture', 'Reading emphasis 阅读强调');
  });
  const text = page.getByText('Reading emphasis 阅读强调', { exact: true });
  const regular = await text.screenshot();
  for (const weight of ['600', '650', '700']) {
    await text.evaluate((element, weight) => { element.style.fontWeight = weight; }, weight);
    expect((await text.screenshot()).equals(regular), `weight ${weight} renders heavier than regular`).toBe(false);
  }
});
