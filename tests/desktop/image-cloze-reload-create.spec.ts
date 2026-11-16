import fs from 'node:fs';

import { expect, test } from './harness/fixtures';
import { clozeIds, dragImageCloze, openSource, OWNER_ID, readDocument, seedImageSource } from './harness/imageClozeSource';
import { expectWorkspaceShell } from './harness/settings';

for (const reload of [false, true]) {
  test(`creates another image cloze with an existing region ${reload ? 'after reload' : 'without reload'}`, async ({
    desktopWindow: page
  }, info) => {
    await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
    await page.reload();
    await expectWorkspaceShell(page);
    await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
    await seedImageSource(page);
    await dragImageCloze(page);
    await page.getByRole('button', { name: 'Confirm image cloze' }).click();
    await expect.poll(() => clozeIds(page)).toHaveLength(1);
    const firstId = (await clozeIds(page))[0]!;
    const first = await readDocument(page, firstId);
    const parent = await readDocument(page, OWNER_ID);
    expect(first.kind).toBe('item');
    expect(first.content).toContain('asset://');
    expect(first.reveal).toContain('asset://');
    expect(first.imageRegions?.flatMap(group => group.regions)).toHaveLength(1);
    if (reload) {
      await page.reload();
      await expectWorkspaceShell(page);
      await expect.poll(() => clozeIds(page)).toEqual([firstId]);
    }
    await openSource(page);
    await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(1);
    await dragImageCloze(page, true);
    await expect(page.getByRole('button', { name: 'Confirm image cloze' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm image cloze' }).click();
    await expect.poll(() => clozeIds(page)).toHaveLength(2);
    const created = await clozeIds(page);
    const secondId = created.find(id => id !== firstId)!;
    const second = await readDocument(page, secondId);
    const saved = await readDocument(page, OWNER_ID);
    expect(await readDocument(page, firstId)).toEqual(first);
    expect(saved.content).toBe(parent.content);
    const persistedRegions = [saved, first, second].flatMap(doc => doc.imageRegions?.flatMap(group => group.regions) ?? []);
    expect(new Set(persistedRegions.map(region => region.id)).size).toBe(2);
    expect(persistedRegions).toEqual(expect.arrayContaining(first.imageRegions!.flatMap(group => group.regions)));
    expect(persistedRegions).toEqual(expect.arrayContaining(second.imageRegions!.flatMap(group => group.regions)));
    expect(second.kind).toBe('item');
    expect(second.content).toContain(parent.content);
    expect(second.reveal).toBe(first.reveal);
    await page.reload();
    await expectWorkspaceShell(page);
    await expect.poll(async () => (await clozeIds(page)).sort()).toEqual([...created].sort());
    await openSource(page);
    await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(2);
    expect(await readDocument(page, OWNER_ID)).toEqual(saved);
    expect(await readDocument(page, firstId)).toEqual(first);
    expect(await readDocument(page, secondId)).toEqual(second);
    fs.writeFileSync(info.outputPath('persisted-documents.json'), JSON.stringify({ parent, first, saved, second, created }, null, 2));
    await page.screenshot({ path: info.outputPath('two-persisted-clozes.png') });
  });
}

test('saves image focus for one occurrence and preserves it when creating a cloze', async ({ desktopWindow: page }, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page, 2);
  const original = (await readDocument(page, OWNER_ID)).content.split('\n\n')[0];
  await expect(page.locator('.cm-md-image-element-block')).toHaveCount(2);
  await dragImageCloze(page);
  await page.getByRole('button', { name: 'Focus image region' }).click();
  const masks = page.locator('.cm-md-image-focus-mask');
  await expect(masks).toHaveCount(1);
  await expect(masks.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.3)');
  await expect(masks.first()).toHaveCSS('clip-path', /^polygon\(evenodd,/u);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toContain(';focus=');
  const saved = (await readDocument(page, OWNER_ID)).content;
  expect(saved.split('\n\n')[1]).toBe(original);
  await dragImageCloze(page, true);
  await page.getByRole('button', { name: 'Confirm image cloze' }).click();
  await expect.poll(() => clozeIds(page)).toHaveLength(1);
  const cloze = await readDocument(page, (await clozeIds(page))[0]!);
  expect(cloze.content).toBe(saved.split('\n\n')[0]);
  expect(cloze.reveal).toBe(cloze.content);
  expect(cloze.imageRegions?.flatMap(group => group.regions)).toHaveLength(1);
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  await expect(masks).toHaveCount(1);
  expect(await masks.first().locator('xpath=ancestor::*[contains(@class,"cm-md-image-widget")]').getAttribute('data-md-image-from')).toBe('0');
  expect((await readDocument(page, OWNER_ID)).content).toBe(saved);
  await page.screenshot({ path: info.outputPath('saved-image-focus.png') });
});
