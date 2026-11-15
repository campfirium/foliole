import { expect, test, type DesktopSession } from './harness/fixtures';
import { openSettingsCategory, resizeWindowToWorkAreaPercent, setActiveSidebarTierDockedWidths } from './harness/settings';

const sidebarLayoutName = /^(Sidebar layout|侧栏布局)$/;
const thresholdName = /^(Minimum window width \(%\)|窗口宽度起点（%）)$/;

function readSavedTiers(page: DesktopSession['firstWindow']) {
  return page.evaluate(async () => {
    const settings = await window.electronAPI!.invoke('load_app_settings_state');
    const value = settings['foliole-workspace-sidebar-layout-tiers'];
    return JSON.parse(value) as import('../../src/features/settings/model/sidebarLayoutTiers').SidebarTier[];
  });
}

test('double-clicking a splitter restores just the active tier widths', async ({ desktopWindow: page }) => {
  await setActiveSidebarTierDockedWidths(page, 40, 35);
  const before = await readSavedTiers(page);
  const active = before.find(tier => tier.left.width === 40 && tier.right.width === 35)!;
  expect(active).toBeDefined();
  const left = page.locator('[data-workspace-side-column="list"]');
  const right = page.locator('[data-workspace-side-column="right"]');
  const splitter = page.getByRole('separator', { name: /^(Resize inspector sidebar|调整检查器侧栏宽度)$/ });
  await splitter.dblclick();

  const defaults = active.threshold === null ? [44, 32] : [28, 24];
  await expect.poll(() => readSavedTiers(page)).toEqual(before.map(tier => tier.id === active.id ? {
    ...tier, left: { ...tier.left, width: defaults[0] }, right: { ...tier.right, width: defaults[1] }
  } : tier));
  const bodyWidth = await page.evaluate(() => innerWidth - 40);
  await expect.poll(async () => (await left.boundingBox())?.width).toBeCloseTo(bodyWidth * defaults[0]! / 100, 0);
  await expect.poll(async () => (await right.boundingBox())?.width).toBeCloseTo(bodyWidth * defaults[1]! / 100, 0);
  await page.reload();
  await expect.poll(async () => (await right.boundingBox())?.width).toBeCloseTo(bodyWidth * defaults[1]! / 100, 0);
});

test('edits tier rows, rejects duplicate thresholds and restores the default table', async ({ desktopWindow: page }) => {
  const openSection = async () => (await openSettingsCategory(page, 'Appearance')).getByRole('region', { name: sidebarLayoutName });
  const section = await openSection();
  const restore = () => section.getByRole('button', { name: /^(Restore default tiers|恢复默认档位)$/ }).click();
  await restore();
  const defaults = await readSavedTiers(page);

  await page.keyboard.press('Escape');
  await setActiveSidebarTierDockedWidths(page, 40, 35);
  await openSection();
  const rows = section.locator('tbody tr');
  await expect(rows.first().getByRole('button', { name: /^(Delete tier|删除档位)$/ })).toHaveCount(0);
  await section.getByRole('button', { name: /^(Add tier|添加档位)$/ }).click();
  await expect(rows).toHaveCount(4);
  const added = rows.last();
  await expect(added.getByRole('spinbutton', { name: /Left sidebar|左侧导航/ })).toHaveValue('40');
  await expect(added.getByRole('spinbutton', { name: /Right sidebar|右侧检查器/ })).toHaveValue('35');
  const threshold = added.getByRole('spinbutton', { name: thresholdName });
  const originalThreshold = await threshold.inputValue();
  await threshold.fill('50');
  await threshold.press('Enter');
  await expect(section.getByRole('alert')).toHaveText(/Another tier already uses|已有档位使用此阈值/);
  await expect(threshold).toHaveValue(originalThreshold);
  await threshold.fill('1');
  await threshold.press('Enter');
  await expect(threshold).toHaveValue('1');
  await expect(section.getByRole('alert')).toHaveCount(0);
  await added.getByRole('button', { name: /^(Delete tier|删除档位)$/ }).click();
  await expect(rows).toHaveCount(3);
  await restore();
  await expect.poll(() => readSavedTiers(page)).toEqual(defaults);
  await page.reload();
  await expect((await openSection()).locator('tbody tr')).toHaveCount(3);
  expect(await readSavedTiers(page)).toEqual(defaults);
});

test('cancels an unfinished resize when the window switches tiers', async ({ desktopApp, desktopWindow: page }) => {
  await resizeWindowToWorkAreaPercent(desktopApp, 90);
  await setActiveSidebarTierDockedWidths(page, 40, 35);
  const before = await readSavedTiers(page);
  const right = page.locator('[data-workspace-side-column="right"]');
  const separator = page.getByRole('separator', { name: /^(Resize inspector sidebar|调整检查器侧栏宽度)$/ });
  await expect(separator).toBeVisible();
  const bounds = (await separator.boundingBox())!;
  const initialWidth = (await right.boundingBox())!.width;
  const startX = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 34, y, { steps: 4 });
  await expect.poll(async () => (await right.boundingBox())!.width).toBeGreaterThan(initialWidth + 25);
  await resizeWindowToWorkAreaPercent(desktopApp, 65);
  await expect(right).toHaveClass(/workspace-floating-sidebar-right/);
  await page.mouse.up();
  await resizeWindowToWorkAreaPercent(desktopApp, 90);
  await expect.poll(async () => (await right.boundingBox())?.width).toBeCloseTo(initialWidth, 0);
  expect(await readSavedTiers(page)).toEqual(before);
});
