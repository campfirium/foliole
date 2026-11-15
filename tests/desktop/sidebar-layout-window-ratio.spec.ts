import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory, resizeWindowToWorkAreaPercent, setActiveSidebarTierDockedWidths } from './harness/settings';

const tierPreferenceKey = 'foliole-workspace-sidebar-layout-tiers';

async function dragSeparator(page: Page, separator: ReturnType<Page['getByRole']>, delta: number) {
  await expect(separator).toBeVisible();
  const bounds = (await separator.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta, y, { steps: 4 });
  await page.mouse.up();
}

test('sidebar layout shows the actual window-to-work-area ratio after a native resize', async ({
  desktopApp, desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsCategory(desktopWindow, 'Appearance');
  const section = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ });
  const ratio = section.getByRole('status');

  const resizeTo = (width: number) => desktopApp.evaluate(({ BrowserWindow, screen }, requestedWidth) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.setResizable(true);
    if (window.isMaximized()) window.unmaximize();
    window.setSize(requestedWidth, 850);
    const bounds = window.getBounds();
    return Math.round(100 * bounds.width / screen.getDisplayMatching(bounds).workArea.width);
  }, width);

  const first = await resizeTo(960);
  await expect(ratio).toHaveText(`${first}%`);
  const second = await resizeTo(1260);
  expect(second).not.toBe(first);
  await expect(ratio).toHaveText(`${second}%`);
});

test('applies and restores saved sidebar tier modes and exact widths', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await setActiveSidebarTierDockedWidths(page, 40, 35);

  const left = page.locator('[data-workspace-side-column="list"]');
  const right = page.locator('[data-workspace-side-column="right"]');
  async function expectWidths() {
    const available = await page.evaluate(() => innerWidth - 40);
    await expect.poll(async () => Math.abs((await left.boundingBox())!.width - available * 0.4)).toBeLessThan(1);
    await expect.poll(async () => Math.abs((await right.boundingBox())!.width - available * 0.35)).toBeLessThan(1);
  }

  await expectWidths();
  const handle = page.getByRole('separator', { name: /Resize topic list|调整主题列表宽度/ });
  const before = (await left.boundingBox())!.width;
  await dragSeparator(page, handle, 36);
  await expect.poll(async () => (await left.boundingBox())!.width).toBeGreaterThan(before + 25);
  const draggedWidth = (await left.boundingBox())!.width;
  const beforeRight = (await right.boundingBox())!.width;
  await dragSeparator(page, page.getByRole('separator', { name: /Resize inspector sidebar|调整检查器侧栏宽度/ }), -32);
  await expect.poll(async () => (await right.boundingBox())!.width).toBeGreaterThan(beforeRight + 25);
  const rightWidth = (await right.boundingBox())!.width;
  await page.locator('[data-workspace-sidebar-toggle="left"]').click();
  await expect(page.locator('[data-workspace-sidebar-toggle="left"]')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(async () => Math.abs((await left.boundingBox())!.width - draggedWidth)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await right.boundingBox())!.width - rightWidth)).toBeLessThan(1);
});

test('resizes both edge sidebars without changing the document tracks', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await setActiveSidebarTierDockedWidths(page, 40, 35);
  const settings = await openSettingsCategory(page, 'Appearance');
  const current = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ }).locator('tr[aria-current="true"]');
  const leftLabel = /^(Left sidebar|左侧导航)$/;
  const rightLabel = /^(Right sidebar|右侧检查器)$/;
  await current.getByRole('combobox', { name: leftLabel }).selectOption('edge');
  await current.getByRole('combobox', { name: rightLabel }).selectOption('edge');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  const persisted = () => page.evaluate(async key => {
    const settings = await window.electronAPI!.invoke('load_app_settings_state');
    return JSON.parse(settings[key]) as import('../../src/features/settings/model/sidebarLayoutTiers').SidebarTier[];
  }, tierPreferenceKey);
  const before = await persisted();
  const document = page.locator('[data-workspace-document-focus-target]').first();
  const documentBounds = await document.boundingBox();
  const viewport = page.viewportSize()!;

  for (const side of ['left', 'right'] as const) {
    const panel = page.locator(`.workspace-floating-sidebar-${side}`);
    const edge = side === 'left' ? 75 : viewport.width - 60;
    const name = side === 'left' ? /Resize topic list|调整主题列表宽度/ : /Resize inspector sidebar|调整检查器侧栏宽度/;
    await page.mouse.move(edge, 400);
    await expect(panel).toBeVisible();
    const startWidth = (await panel.boundingBox())!.width;
    await dragSeparator(page, panel.getByRole('separator', { name }), side === 'left' ? 34 : -34);
    await expect.poll(async () => (await panel.boundingBox())!.width - startWidth).toBeGreaterThan(29);
    expect(await document.boundingBox()).toEqual(documentBounds);
    await page.keyboard.press('Escape');
    await page.mouse.move(viewport.width / 2, 400);
    await expect(panel).toBeHidden();
    await page.mouse.move(edge, 400);
    await expect(panel).toBeVisible();
    await expect.poll(async () => (await panel.boundingBox())!.width - startWidth).toBeGreaterThan(29);
    await page.keyboard.press('Escape');
    await page.mouse.move(viewport.width / 2, 400);
  }

  await expect.poll(async () => (await persisted()).filter((tier, index) => JSON.stringify(tier) !== JSON.stringify(before[index])).length).toBe(1);
  const after = (await persisted()).find((tier, index) => JSON.stringify(tier) !== JSON.stringify(before[index]))!;
  const previous = before.find(tier => tier.id === after.id)!;
  expect(after.left.width).toBeGreaterThan(previous.left.width);
  expect(after.right.width).toBeGreaterThan(previous.right.width);
});

async function seedPreviousSidebarPreferences(app: ElectronApplication, page: Page) {
  const previous = {
    'foliole-workspace-list-width': '420',
    'foliole-workspace-list-collapsed': 'false',
    'foliole-workspace-right-sidebar-width': '340',
    'foliole-workspace-right-sidebar-collapsed': 'true'
  };
  const workspaceUrl = page.url();
  // Keep the running workspace from saving a settings snapshot while preparing the old installation.
  await page.goto('about:blank');
  await page.addInitScript(({ workspaceUrl, keys }) => {
    if (location.href !== workspaceUrl) return;
    for (const key of keys) localStorage.removeItem(key);
  }, { workspaceUrl, keys: [...Object.keys(previous), tierPreferenceKey] });
  await app.evaluate((_electron, { previous, tierKey }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { loadJsonSetting, saveJsonSetting } = require(`${process.cwd()}/dist/electron/database/settingsStore.js`);
    runWithDatabaseConnectionOwner(() => {
      const settings = { ...loadJsonSetting('app_settings'), ...previous };
      delete settings[tierKey];
      saveJsonSetting('app_settings', settings);
    });
  }, { previous, tierKey: tierPreferenceKey });
  await page.goto(workspaceUrl);
}

test('inherits the previous sidebar preferences once and restores them after crossing a tier', async ({
  desktopApp, desktopWindow: page
}) => {
  const resize = (percent: number) => resizeWindowToWorkAreaPercent(desktopApp, percent);
  await expectWorkspaceShell(page);
  await resize(90);
  const settings = await openSettingsCategory(page, 'Appearance');
  const section = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ });
  await expect(section.getByRole('status')).toHaveText('90%');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await seedPreviousSidebarPreferences(desktopApp, page);
  await expectWorkspaceShell(page);

  const saved = () => page.evaluate(async key => {
    const settings = await window.electronAPI!.invoke('load_app_settings_state');
    return settings[key] ? JSON.parse(settings[key]) : null;
  }, tierPreferenceKey);
  const left = page.locator('[data-workspace-side-column="list"]');
  const toggle = page.locator('[data-workspace-sidebar-toggle="left"]');
  const right = page.locator('[data-workspace-sidebar-toggle="right"]');
  const width = async () => (await left.boundingBox())?.width ?? 0;
  const bodyWidth = await page.evaluate(() => innerWidth - 40);
  await expect.poll(saved).toEqual([
    { id: 'base', threshold: null, left: { mode: 'edge', width: 44 }, right: { mode: 'edge', width: 32 } },
    { id: 'medium', threshold: 50, left: { mode: 'dock', width: 28 }, right: { mode: 'edge', width: 24 } },
    { id: 'wide', threshold: 80, left: { mode: 'dock', width: 42000 / bodyWidth }, right: { mode: 'closed', width: 34000 / bodyWidth } }
  ]);
  const initial = await saved();
  await expect.poll(async () => Math.abs(await width() - 420)).toBeLessThan(1);
  await expect(right).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await resize(65);
  await expect.poll(async () => Math.abs(await width() - (await page.evaluate(() => innerWidth - 40)) * 0.28)).toBeLessThan(1);
  await resize(90);
  await expect.poll(async () => Math.abs(await width() - 420)).toBeLessThan(1);
  await expect(right).toHaveAttribute('aria-pressed', 'false');
  expect(await saved()).toEqual(initial);
});
