import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

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
  const settings = await openSettingsCategory(page, 'Appearance');
  const section = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ });
  const active = section.locator('tr[aria-current="true"]');
  const sideLabel = (side: 'left' | 'right') => side === 'left'
    ? /^(Left sidebar|左侧导航)$/ : /^(Right sidebar|右侧检查器)$/;
  for (const [side, width] of [['left', 40], ['right', 35]] as const) {
    await active.getByRole('combobox', { name: sideLabel(side) }).selectOption('dock');
    const field = active.getByRole('spinbutton', { name: side === 'left' ? /Left sidebar|左侧导航/ : /Right sidebar|右侧检查器/ });
    await field.fill(String(width));
    await field.press('Enter');
  }
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

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
