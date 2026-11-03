import { expect, test } from '@playwright/test';

import { addFonts, openReader, renderedWidths, seedLegacyFont } from '../fixtures/companionFontBrowser';

test('removes a selected variant, then the last face, while preserving another family', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular', 'Bold', 'PreferredRegular']);
  await page.getByRole('button', { name: 'Foliole Test Reading', exact: true }).click();
  const editor = await page.locator('.cm-content').elementHandle();
  await page.locator('details').filter({ hasText: '700' }).locator('summary').click();
  await page.getByRole('button', { name: 'Remove Foliole Test Reading 700', exact: true }).click();
  await expect.poll(async () => {
    const widths = await renderedWidths(page);
    return widths[1] === widths[0];
  }).toBe(true);
  expect(await editor!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Remove Foliole Test Reading 400', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Foliole Test Reading', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Foliole Preferred Family', exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe('sans');
  expect(await page.evaluate(() => Array.from(document.fonts).filter(face => face.family.startsWith('FolioleReadingFont_')).length)).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(page.getByRole('button', { name: 'Foliole Preferred Family', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Foliole Test Reading', exact: true })).toHaveCount(0);
});

test('keeps selected font bytes on an actual localStorage quota failure, then retries', async ({ page }) => {
  await openReader(page);
  const id = await seedLegacyFont(page);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.evaluate(() => {
    let low = 0, high = 12_000_000;
    while (high - low > 1) {
      const length = Math.floor((low + high) / 2);
      try { localStorage.setItem('quota', 'x'.repeat(length)); low = length; }
      catch { high = length; }
    }
  });
  await page.getByRole('button', { name: 'Remove Old reader', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Old reader', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe(`custom:${id}`);
  await page.evaluate(() => localStorage.removeItem('quota'));
  await page.getByRole('button', { name: 'Remove Old reader', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Old reader', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Array.from(document.fonts).filter(face => face.family.startsWith('FolioleReadingFont_')).length)).toBe(0);
});

test('restores selection and preserves bytes when the actual delete transaction aborts', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  const selection = await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily);
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    let abortNext = true;
    IDBObjectStore.prototype.delete = function (key) {
      const request = remove.call(this, key);
      if (abortNext && this.name === 'fonts') { abortNext = false; this.transaction.abort(); }
      return request;
    };
  });
  await page.getByRole('button', { name: 'Remove Foliole Test Reading', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Foliole Test Reading', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe(selection);
  await page.getByRole('button', { name: 'Remove Foliole Test Reading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Foliole Test Reading', exact: true })).toHaveCount(0);
});

test('does not resurrect a deleted family after a slow real FontFace load finishes', async ({ page }) => {
  await openReader(page);
  const id = await seedLegacyFont(page);
  await page.addInitScript(() => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const load = FontFace.prototype.load;
    Reflect.set(window, 'releaseFontLoads', release);
    Reflect.set(window, 'fontLoads', 0);
    FontFace.prototype.load = async function () {
      Reflect.set(window, 'fontLoads', Reflect.get(window, 'fontLoads') + 1);
      const face = await load.call(this);
      await gate;
      return face;
    };
  });
  await page.reload();
  await page.evaluate(async id => {
    const modulePath = '/src/shared/typography/readingFontLibrary.ts';
    const { activateReadingFont } = await import(modulePath);
    Reflect.set(window, 'pendingActivation', activateReadingFont(id).catch((error: Error) => error.message));
  }, id);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'fontLoads'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.getByRole('button', { name: 'Remove Old reader', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Old reader', exact: true })).toHaveCount(0);
  const outcome = await page.evaluate(async () => {
    Reflect.get(window, 'releaseFontLoads')();
    return await Reflect.get(window, 'pendingActivation');
  });
  expect(outcome).toContain('superseded');
  expect(await page.evaluate(() => Array.from(document.fonts).filter(face => face.family.startsWith('FolioleReadingFont_')).length)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe('sans');
});

test('reports an actual font decoder failure while keeping the saved selection', async ({ page }) => {
  await openReader(page);
  const id = await seedLegacyFont(page);
  await page.evaluate(async id => {
    // Prepare a pre-existing damaged file, then exercise ordinary startup and selection.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('foliole-companion-reading-fonts', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('fonts', 'readwrite');
        tx.objectStore('fonts').put({ id, name: 'Old reader', data: new Uint8Array([1, 2, 3]).buffer });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, id);
  await page.reload();
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load the selected font');
  await expect(page.getByRole('button', { name: 'Old reader', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe(`custom:${id}`);
});

test('retains a newer system font choice when a stored custom face finishes loading', async ({ page }) => {
  await openReader(page);
  await addFonts(page, ['Regular']);
  await page.getByRole('button', { name: 'Sans', exact: true }).click();
  await page.addInitScript(() => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const load = FontFace.prototype.load;
    Reflect.set(window, 'releaseFontLoads', release);
    Reflect.set(window, 'fontLoads', 0);
    FontFace.prototype.load = async function () {
      Reflect.set(window, 'fontLoads', Reflect.get(window, 'fontLoads') + 1);
      const face = await load.call(this);
      await gate;
      return face;
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  const family = page.getByRole('button', { name: 'Foliole Test Reading', exact: true });
  await family.click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'fontLoads'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Serif', exact: true }).click();
  await page.evaluate(() => Reflect.get(window, 'releaseFontLoads')());
  await expect(family).toBeEnabled();
  await expect(family).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Serif', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foliole-companion-reading-typography-settings')!).fontFamily)).toBe('serif');
});
