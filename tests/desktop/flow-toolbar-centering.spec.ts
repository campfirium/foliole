import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { IMMERSIVE_READING_KEY } from './harness/immersiveReadingShortcut';
import { expectWorkspaceShell, openSettingsCategory, setActiveSidebarTierDockedWidths } from './harness/settings';

const readingPane = '[data-workspace-document-focus-target]';
const flowToolbar = (page: Page) => page.getByRole('group', { name: 'Flow toolbar', exact: true });
const sidebarToggle = (page: Page, side: 'left' | 'right') =>
  page.locator(`[data-workspace-sidebar-toggle="${side}"]`);

async function expectCentered(page: Page, scenario: string, kind: 'reading' | 'grade' = 'reading') {
  const actions = flowToolbar(page).getByRole('group').filter({
    has: page.getByRole('button', { name: kind === 'reading' ? 'Soon' : 'Easy', exact: true })
  });
  await expect(actions).toBeVisible();
  const geometry = await actions.evaluate((group, paneSelector) => {
    const pane = document.querySelector(paneSelector)!.getBoundingClientRect();
    const bounds = group.getBoundingClientRect();
    const toolbar = group.closest('[aria-label="Flow toolbar"]')!.getBoundingClientRect();
    return {
      toolbarOffset: toolbar.x + toolbar.width / 2 - pane.x - pane.width / 2,
      offset: bounds.x + bounds.width / 2 - pane.x - pane.width / 2,
      fits: bounds.left >= pane.left && bounds.right <= pane.right,
      paneWidth: pane.width,
      dpr: devicePixelRatio,
      width: innerWidth
    };
  }, readingPane);
  await page.screenshot({ path: `.tmp/artifacts/desktop-acceptance/flow-toolbar-centering/${scenario}.png` });
  expect.soft(Math.abs(geometry.offset), `${scenario}: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
  expect.soft(geometry.fits, `${scenario}: all primary actions fit the reading pane`).toBe(true);
  expect.soft(Math.abs(geometry.toolbarOffset), `${scenario}: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
  return actions;
}

async function resizeLeftSidebar(page: Page) {
  const pane = page.locator(readingPane);
  const initialWidth = (await pane.boundingBox())!.width;
  const handle = page.getByRole('separator', { name: /Resize topic list|调整主题列表宽度/ });
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 36, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await pane.boundingBox())!.width).toBeLessThan(initialWidth - 20);
}

async function enterFlow(page: Page) {
  const enter = page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ });
  if (await enter.isVisible()) await enter.click();
}

async function setImmersive(page: Page, enabled: boolean) {
  await page.keyboard.press(IMMERSIVE_READING_KEY);
  await expect(flowToolbar(page)).toHaveAttribute('data-surface', enabled ? 'overlay' : 'panel');
}

test('Flow reading actions follow the reading pane as sidebars and zoom change', async ({
  desktopApp, desktopWindow: page
}) => {
  await expectWorkspaceShell(page);
  const host = await desktopApp.browserWindow(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await host.evaluate((window) => window.webContents.setZoomFactor(1.2));
  await expect.poll(() => host.evaluate((window) => window.webContents.getZoomFactor())).toBeCloseTo(1.2, 4);
  await setActiveSidebarTierDockedWidths(page, 37, 25);
  await enterFlow(page);
  await expectCentered(page, 'docked-120');
  await resizeLeftSidebar(page);
  const narrow = await expectCentered(page, 'docked-narrow-120');
  await narrow.getByRole('button', { name: 'Soon', exact: true }).click({ trial: true });
  await narrow.getByRole('button', { name: 'Dismiss', exact: true }).click({ trial: true });

  await setImmersive(page, true);
  await expectCentered(page, 'immersive-120');
  await page.setViewportSize({ width: 440, height: 650 });
  const compactOverlay = await expectCentered(page, 'immersive-narrow-120');
  await compactOverlay.getByRole('button', { name: 'Dismiss', exact: true }).click({ trial: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await setImmersive(page, false);

  await sidebarToggle(page, 'right').click();
  await expect(sidebarToggle(page, 'right')).toHaveAttribute('aria-pressed', 'false');
  await expectCentered(page, 'right-collapsed-120');

  const settings = await openSettingsCategory(page, 'Appearance');
  const current = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ }).locator('tr[aria-current="true"]');
  await current.getByRole('combobox', { name: /Left sidebar|左侧导航/ }).selectOption('edge');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await page.mouse.move(75, 400);
  await expect(page.locator('.workspace-floating-sidebar-left')).toBeVisible();
  await expectCentered(page, 'left-floating-120');
  await page.mouse.move(650, 300);

  await host.evaluate((window) => window.webContents.setZoomFactor(1));
  for (const width of [1280, 1279, 1081, 1080, 1000, 440]) {
    await page.setViewportSize({ width, height: 650 });
    await expectCentered(page, `viewport-${width}`);
  }
});

test('the whole immersive Flow toolbar centers with an asymmetric saved sidebar layout', async ({
  desktopApp, desktopWindow: page
}) => {
  await expectWorkspaceShell(page);
  const host = await desktopApp.browserWindow(page);
  // Approximate the reported app area in device-independent pixels.
  await page.setViewportSize({ width: 1488, height: 864 });
  await host.evaluate((window) => window.webContents.setZoomFactor(1.2));
  await expect.poll(() => host.evaluate((window) => window.webContents.getZoomFactor())).toBeCloseTo(1.2, 4);
  await setActiveSidebarTierDockedWidths(page, 39, 25);
  await enterFlow(page);
  await sidebarToggle(page, 'right').click();
  await expect(sidebarToggle(page, 'right')).toHaveAttribute('aria-pressed', 'false');
  await setImmersive(page, true);
  await expectCentered(page, 'immersive-left-docked-right-collapsed-120');
});

test('Flow grades stay centered after revealing an answer and entering immersive reading', async ({
  desktopApp, desktopWindow: page
}) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([{
      id: 'toolbar-centering-item', kind: 'item', title: 'A review item', content: 'Question', reveal: 'Answer',
      review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    }], { persist: true });
  });
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  const exit = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exit.isVisible()) await exit.click();
  await setActiveSidebarTierDockedWidths(page, 37, 25);
  await page.setViewportSize({ width: 1000, height: 650 });
  await enterFlow(page);
  await flowToolbar(page).getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  const grades = await expectCentered(page, 'grade-docked', 'grade');
  await grades.getByRole('button', { name: 'Again', exact: true }).click({ trial: true });
  await grades.getByRole('button', { name: 'Easy', exact: true }).click({ trial: true });
  await setImmersive(page, true);
  await expectCentered(page, 'grade-immersive', 'grade');
});
