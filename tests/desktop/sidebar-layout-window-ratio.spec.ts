import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory, setActiveSidebarTierDockedWidths } from './harness/settings';

const tierPreferenceKey = 'foliole-workspace-sidebar-layout-tiers';

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
  const bounds = (await handle.boundingBox())!;
  const before = (await left.boundingBox())!.width;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 36, bounds.y + bounds.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await left.boundingBox())!.width).toBeGreaterThan(before + 25);
  const draggedWidth = (await left.boundingBox())!.width;
  const rightWidth = (await right.boundingBox())!.width;
  await page.locator('[data-workspace-sidebar-toggle="left"]').click();
  await expect(page.locator('[data-workspace-sidebar-toggle="left"]')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(async () => Math.abs((await left.boundingBox())!.width - draggedWidth)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await right.boundingBox())!.width - rightWidth)).toBeLessThan(1);
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
  const resize = (percent: number) => desktopApp.evaluate(({ BrowserWindow, screen }, ratio) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    const { width } = screen.getDisplayMatching(window.getBounds()).workArea;
    window.setResizable(true);
    if (window.isMaximized()) window.unmaximize();
    window.setSize(Math.round(width * ratio / 100), 850);
  }, percent);
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
