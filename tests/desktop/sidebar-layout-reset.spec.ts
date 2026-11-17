import { expect, test, type DesktopSession } from './harness/fixtures';
import { openSettingsCategory, resizeWorkspaceWindow, setActiveSidebarTierDockedWidths } from './harness/settings';

const sidebarLayoutName = /^(Sidebar layout|侧栏布局)$/;
const thresholdName = /^(Minimum window width \(%\)|窗口宽度起点（%）)$/;

test('places the preview-style sidebar rules immediately below workspace surface colors', async ({ desktopWindow: page }, testInfo) => {
  const settings = await openSettingsCategory(page, 'Appearance');
  const surface = settings.getByRole('region', { name: /Workspace surface color|工作区表面颜色/i });
  const rules = settings.getByRole('region', { name: sidebarLayoutName });
  const surfaceElement = await surface.elementHandle();
  await expect.poll(() => rules.evaluate((section, colors) => colors?.nextElementSibling === section, surfaceElement)).toBe(true);

  const table = rules.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText([
    /Window width|窗口宽度/, /Left sidebar|左栏/, /Width|宽度/,
    /Right sidebar|右栏/, /Width|宽度/, ''
  ]);
  await expect(table.locator('tbody tr[aria-current="true"] > td')).toHaveCount(6);
  await expect(rules.locator('[data-settings-section-header]').getByRole('button', {
    name: /^(Restore default tiers|恢复默认档位)$/
  })).toBeVisible();
  await expect(rules.getByRole('button', { name: /^(Add tier|添加档位)$/ })).toBeVisible();
  const screenshot = testInfo.outputPath('sidebar-layout-settings.png');
  await rules.screenshot({ path: screenshot });
  await testInfo.attach('sidebar-layout-settings', { path: screenshot, contentType: 'image/png' });
});

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
  const base = rows.last();
  await expect(base.getByRole('button', { name: /^(Delete tier|删除档位)$/ })).toHaveCount(0);
  await expect(base.getByRole('cell').first()).toHaveText(/<\s*50%/);
  await section.getByRole('button', { name: /^(Add tier|添加档位)$/ }).click();
  await expect(rows).toHaveCount(4);
  const addedRule = (await readSavedTiers(page)).find(tier => !defaults.some(rule => rule.id === tier.id))!;
  const thresholdAt = (value: number) => page.getByRole('spinbutton', { name: thresholdName }).and(page.locator(`input[value="${value}"]`));
  const added = rows.filter({ has: thresholdAt(addedRule.threshold!) });
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
  const updated = thresholdAt(1);
  await expect(updated).toHaveValue('1');
  await expect(section.getByRole('alert')).toHaveCount(0);
  await rows.filter({ has: updated }).getByRole('button', { name: /^(Delete tier|删除档位)$/ }).click();
  await expect(rows).toHaveCount(3);
  await restore();
  await expect.poll(() => readSavedTiers(page)).toEqual(defaults);
  await page.reload();
  await expect((await openSection()).locator('tbody tr')).toHaveCount(3);
  expect(await readSavedTiers(page)).toEqual(defaults);
});

test('cancels an unfinished resize when the window switches tiers', async ({ desktopApp, desktopWindow: page }) => {
  await resizeWorkspaceWindow(desktopApp, page, { percent: 90 });
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
  await resizeWorkspaceWindow(desktopApp, page, { percent: 65 });
  await expect(right).toHaveClass(/workspace-floating-sidebar-right/);
  await page.mouse.up();
  await resizeWorkspaceWindow(desktopApp, page, { percent: 90 });
  await expect.poll(async () => (await right.boundingBox())?.width).toBeCloseTo(initialWidth, 0);
  expect(await readSavedTiers(page)).toEqual(before);
});

test('previews each configured tier with the slider without resizing the actual window', async ({ desktopWindow: page }, testInfo) => {
  const settings = await openSettingsCategory(page, 'Appearance');
  const rules = settings.getByRole('region', { name: sidebarLayoutName });
  await rules.getByRole('button', { name: /Restore default tiers|恢复默认档位/ }).click();
  const actual = await rules.getByRole('status').innerText();
  const document = rules.locator('[data-sidebar-preview-document]');
  await expect(document.locator('span')).toHaveCount(2);
  const preview = rules.getByRole('region', { name: /Layout preview|布局预览/ });
  const slider = preview.getByRole('slider', { name: /^(Window width|窗口宽度)$/ });
  await expect(preview.getByText(/^(Window width|窗口宽度|Document|正文)$/)).toBeHidden();
  const left = preview.locator('[data-sidebar-preview-panel="left"]');
  const right = preview.locator('[data-sidebar-preview-panel="right"]');

  await slider.fill('90');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await slider.fill('65');
  await expect(left).toBeVisible();
  await expect(right).toBeHidden();
  const documentBounds = await document.boundingBox();
  const rightToggle = preview.getByRole('button', { name: /^(Right sidebar|右侧检查器)$/ });
  await rightToggle.click();
  await expect(right).toBeVisible();
  expect(await document.boundingBox()).toEqual(documentBounds);
  await expect(right).toHaveAttribute('data-floating', 'true');
  await expect(right).toContainText(/Overlay|浮层/);
  const overlay = (await right.boundingBox())!;
  expect(overlay.x).toBeLessThan(documentBounds!.x + documentBounds!.width);
  const leftBounds = (await left.boundingBox())!;
  expect(overlay.y).toBeCloseTo(leftBounds.y, 0);
  expect(overlay.height).toBeCloseTo(leftBounds.height, 0);
  await expect(right.evaluate(panel => {
    const { x, y, width, height } = panel.getBoundingClientRect();
    return panel.contains(panel.ownerDocument.elementFromPoint(x + width / 2, y + height / 2));
  })).resolves.toBe(true);
  await rightToggle.click();
  await expect(right).toBeHidden();
  await preview.locator('[data-sidebar-preview-edge="right"]').hover();
  await expect(right).toBeVisible();
  expect(await document.boundingBox()).toEqual(documentBounds);
  await slider.fill('45');
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
  await expect(rules.locator('tr[aria-current="true"]')).toContainText('< 50%');
  await expect(rules.getByRole('status')).toHaveText(actual);
  await slider.hover();
  await slider.fill('65');
  await expect(right).toBeHidden();
  const beforeScreenshot = testInfo.outputPath('sidebar-layout-before-overlay.png');
  await preview.screenshot({ path: beforeScreenshot });
  await testInfo.attach('sidebar-layout-before-overlay', { path: beforeScreenshot, contentType: 'image/png' });
  await rightToggle.press('Space');
  await expect(right).toBeVisible();
  const screenshot = testInfo.outputPath('sidebar-layout-with-preview.png');
  await preview.screenshot({ path: screenshot });
  await expect(right).toBeVisible();
  await testInfo.attach('sidebar-layout-with-preview', { path: screenshot, contentType: 'image/png' });
});
