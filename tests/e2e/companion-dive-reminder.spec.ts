import { expect, test } from '@playwright/test';

import { loadBuiltCompanionFixture } from './companionBuiltSettingsFixture';

for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`keeps the reminder Dive picker reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('button', { name: 'On notification tap None' });
    await loadBuiltCompanionFixture(page, 'companionDiveReminderLayout', trigger);
    await trigger.click();
    await page.getByRole('button', { name: 'Open Dive Flow' }).click();
    await page.getByRole('button', { name: 'Dive Choose a Dive' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a Dive' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Done' })).toBeInViewport();
    await expect.poll(async () => {
      const bounds = await picker.boundingBox();
      return Boolean(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1);
    }).toBe(true);
    expect(await picker.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`reminder-dive-picker-${viewport.width}.png`) });
    await picker.getByRole('button', { name: /next Flow session 12$/ }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByRole('button', { name: /^Dive .* session 12$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
  });
}
