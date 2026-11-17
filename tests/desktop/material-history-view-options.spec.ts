import type { Page } from '@playwright/test';

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
    window.localStorage.setItem('foliole-material-history-view', JSON.stringify({ first: 'preview', lines: 2 }));
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

  await trigger.click();
  await verifyHistoryFontSizes(page);
  await expect(options.getByRole('radio', { name: 'Preview first' })).toBeChecked();
  await expect(options.getByRole('radio', { name: '2', exact: true })).toBeChecked();
  await options.getByText('Breadcrumb first', { exact: true }).click();
  await expect(breadcrumbFirst).toBeVisible();
  await options.getByText('1', { exact: true }).click();
  await expect(preview).toHaveCSS('-webkit-line-clamp', '1');
  await options.getByRole('radio', { name: '1', exact: true }).press('ArrowRight');
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');
  await options.getByText('3', { exact: true }).click();
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

async function verifyHistoryFontSizes(page: Page) {
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  const size = history.getByRole('slider', { name: 'Font size' });
  const preview = history.getByText(/^History preview text/);
  const breadcrumb = history.getByText(title, { exact: true });
  await expect(size).toHaveValue('15');
  await expect(history.getByText('15', { exact: true })).toBeVisible();
  await expect(preview).toHaveCSS('font-size', '15px');
  await size.press('Home');
  await expect(size).toHaveValue('10');
  await expect(history.getByText('10', { exact: true })).toBeVisible();
  await expect(preview).toHaveCSS('font-size', '10px');
  await expect(breadcrumb).toHaveCSS('font-size', '10px');
  for (let step = 0; step < 7; step++) await size.press('ArrowRight');
  await expect(size).toHaveValue('17');
  await expect(preview).toHaveCSS('font-size', '17px');
  await expect(breadcrumb).toHaveCSS('font-size', '14px');
}

async function expectHistoryPreferencesSaved(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const settings = await window.electronAPI.invoke('load_app_settings_state', {});
    const value = settings?.['foliole-material-history-view'];
    return {
      view: value && JSON.parse(value),
      shortcutsCollapsed: settings?.['foliole-material-history-shortcuts-collapsed']
    };
  })).toEqual({ view: { first: 'breadcrumb', lines: 3, fontSize: 17 }, shortcutsCollapsed: 'false' });

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
  await expect(history.getByText(title, { exact: true })).toHaveCSS('font-size', '19px');
  const collapseShortcuts = history.getByRole('button', { name: 'Collapse history shortcuts' });
  await expect(collapseShortcuts).toHaveAttribute('aria-expanded', 'true');
  await collapseShortcuts.click();
  await expect(history.getByText('Space', { exact: true })).toBeHidden();
  await history.getByRole('button', { name: 'View options' }).click();
  const options = history.getByRole('group', { name: 'View options' });
  await expect(options.getByRole('radio', { name: 'Breadcrumb first' })).toBeChecked();
  await expect(options.getByRole('radio', { name: '3', exact: true })).toBeChecked();
  await expect(options.getByRole('slider', { name: 'Font size' })).toHaveValue('17');
  await history.getByRole('searchbox').click();
  await expect(options).toBeHidden();
}
