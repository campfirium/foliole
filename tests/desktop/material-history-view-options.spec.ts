import type { Locator, Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, normalizeDesktopWindow, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const content = 'History preview text ' + 'WIDE WINDOW WELCOME '.repeat(12).trim();
const title = 'History layout topic';

async function openHistory(page: Page) {
  await page.getByRole('region', { name: 'Left toolbar' }).getByRole('button', { name: 'History', exact: true }).click();
  return page.getByRole('dialog', { name: 'History', exact: true });
}

test('history view options apply immediately and return after app restart', async ({ desktopSession, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ title, content }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem('foliole-material-history-view', JSON.stringify({ first: 'preview', lines: 2, fontSize: 15 }));
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'history-layout', kind: 'topic', parentNodeId: 'special-inbox', title, content }
    ], { persist: true });
  }, { title, content });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('treeitem', { name: title, exact: true }).click();

  const history = await openHistory(page);
  const showShortcuts = history.getByRole('button', { name: 'Show history shortcuts' });
  await expect(showShortcuts).toHaveAttribute('aria-expanded', 'false');
  await showShortcuts.click();
  await expect(history.getByText('Space', { exact: true })).toBeVisible();
  const trigger = history.getByRole('button', { name: 'View options' });
  const options = history.getByRole('group', { name: 'View options' });
  const preview = history.getByText(/^History preview text/);
  const previewFirst = history.getByRole('button', { name: /^History preview text.*History layout topic$/ });
  const breadcrumbFirst = history.getByRole('button', { name: /^.*History layout topic History preview text/ });
  await expect(previewFirst).toBeVisible();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');

  await verifyHistoryRowContrast(history, previewFirst, preview);
  await trigger.click();
  await verifyHistoryFontSizes(page);
  await expect(options.getByRole('radio', { name: 'Preview first' })).toBeChecked();
  await expect(options.getByRole('group', { name: 'Preview lines' }).getByRole('status')).toHaveText('2');
  await options.getByText('Breadcrumb first', { exact: true }).click();
  await expect(breadcrumbFirst).toBeVisible();
  await expect(preview).toHaveCSS('font-size', '17px');
  await expect(history.getByText(title, { exact: true })).toHaveCSS('font-size', '13px');
  await verifyHistoryPreviewLines(page);
  await expect.poll(() => preview.evaluate(element =>
    element.clientHeight / Number.parseFloat(getComputedStyle(element).lineHeight)
  )).toBe(3);
  await history.screenshot({ path: '.tmp/artifacts/T774/history-view-options.png' });

  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await expect(history).toBeVisible();
  await expect(trigger).toBeFocused();
  await expectHistoryPreferencesSaved(page);

  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await openHistory(page);
  await expect(breadcrumbFirst).toBeVisible();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '3');

  await restartAndVerify(desktopSession, page);
});

async function colorOpacity(element: Locator, property: 'backgroundColor' | 'color') {
  return element.evaluate((node, property) => {
    const context = document.createElement('canvas').getContext('2d')!;
    context.fillStyle = getComputedStyle(node)[property];
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3] / 255;
  }, property);
}

async function verifyHistoryRowContrast(history: Locator, row: Locator, preview: Locator) {
  await row.hover();
  const rowOpacity = () => colorOpacity(row, 'backgroundColor');
  await expect.poll(rowOpacity).toBeGreaterThan(0.3);
  await expect.poll(rowOpacity).toBeLessThan(0.65);
  const search = history.getByRole('searchbox');
  await search.hover();
  await search.press('ArrowDown');
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect.poll(rowOpacity).toBeGreaterThan(0.3);
  await expect.poll(rowOpacity).toBeLessThan(0.65);
  expect(await colorOpacity(preview, 'color')).toBeGreaterThan(0.75);
}

async function verifyHistoryPreviewLines(page: Page) {
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  const lines = history.getByRole('group', { name: 'Preview lines' });
  const decrease = lines.getByRole('button', { name: 'Decrease preview lines' });
  const increase = lines.getByRole('button', { name: 'Increase preview lines' });
  const preview = history.getByText(/^History preview text/);
  await decrease.click();
  await expect(decrease).toBeDisabled();
  await expect(lines.getByRole('status')).toHaveText('1');
  await expect(preview).toHaveCSS('-webkit-line-clamp', '1');
  await increase.press('Enter');
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');
  await increase.click();
  await expect(increase).toBeDisabled();
  await expect(lines.getByRole('status')).toHaveText('3');
}

async function verifyHistoryFontSizes(page: Page) {
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  const size = history.getByRole('group', { name: 'Preview size' });
  const decrease = size.getByRole('button', { name: 'Decrease preview size' });
  const increase = size.getByRole('button', { name: 'Increase preview size' });
  const value = size.getByRole('status');
  const preview = history.getByText(/^History preview text/);
  const breadcrumb = history.getByText(title, { exact: true });
  await expect(value).toHaveText('15');
  await expect(preview).toHaveCSS('font-size', '15px');
  for (let step = 0; step < 5; step++) await decrease.click();
  await expect(value).toHaveText('10');
  await expect(decrease).toBeDisabled();
  await expect(preview).toHaveCSS('font-size', '10px');
  await expect(breadcrumb).toHaveCSS('font-size', '12px');
  await increase.press('Enter');
  await expect(value).toHaveText('11');
  for (let step = 0; step < 6; step++) await increase.click();
  await expect(value).toHaveText('17');
  await expect(preview).toHaveCSS('font-size', '17px');
  await expect(breadcrumb).toHaveCSS('font-size', '12px');
  const breadcrumbSize = history.getByRole('group', { name: 'Breadcrumb size' });
  await breadcrumbSize.getByRole('button', { name: 'Increase breadcrumb size' }).click();
  await expect(breadcrumbSize.getByRole('status')).toHaveText('13');
  await expect(breadcrumb).toHaveCSS('font-size', '13px');
  await expect(preview).toHaveCSS('font-size', '17px');
}

async function expectHistoryPreferencesSaved(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const settings = await window.electronAPI.invoke('load_app_settings_state', {});
    const value = settings?.['foliole-material-history-view'];
    return {
      view: value && JSON.parse(value),
      shortcutsCollapsed: settings?.['foliole-material-history-shortcuts-collapsed']
    };
  })).toEqual({ view: { first: 'breadcrumb', lines: 3, previewSize: 17, breadcrumbSize: 13 }, shortcutsCollapsed: 'false' });

}

async function restartAndVerify(desktopSession: DesktopSession, page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('foliole-material-history-view');
    window.localStorage.removeItem('foliole-material-history-shortcuts-collapsed');
  });
  await desktopSession.electronApp.close();
  const restarted = await launchDesktopSession({
    env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot }
  }) as DesktopSession;
  try {
    await normalizeDesktopWindow(restarted);
    await verifyRestart(restarted.firstWindow);
  } finally {
    await restarted.close();
  }
}

async function verifyRestart(page: Page) {
  await expectWorkspaceShell(page);
  const history = await openHistory(page);
  await expect(history.getByRole('button', { name: /^.*History layout topic History preview text/ })).toBeVisible();
  await expect(history.getByText(/^History preview text/)).toHaveCSS('-webkit-line-clamp', '3');
  await expect(history.getByText(/^History preview text/)).toHaveCSS('font-size', '17px');
  await expect(history.getByText(title, { exact: true })).toHaveCSS('font-size', '13px');
  const collapseShortcuts = history.getByRole('button', { name: 'Collapse history shortcuts' });
  await expect(collapseShortcuts).toHaveAttribute('aria-expanded', 'true');
  await collapseShortcuts.click();
  await expect(history.getByText('Space', { exact: true })).toBeHidden();
  await history.getByRole('button', { name: 'View options' }).click();
  const options = history.getByRole('group', { name: 'View options' });
  await expect(options.getByRole('radio', { name: 'Breadcrumb first' })).toBeChecked();
  await expect(options.getByRole('group', { name: 'Preview lines' }).getByRole('status')).toHaveText('3');
  await expect(options.getByRole('group', { name: 'Preview size' }).getByRole('status')).toHaveText('17');
  await expect(options.getByRole('group', { name: 'Breadcrumb size' }).getByRole('status')).toHaveText('13');
  await history.getByRole('searchbox').click();
  await expect(options).toBeHidden();
}
