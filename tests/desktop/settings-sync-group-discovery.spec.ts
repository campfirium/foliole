import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import type { SyncGroupDiscoverySnapshot } from '../../lib/platform/syncGroupDiscoveryContract';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EVIDENCE_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const SCREENSHOT_PATH = path.join(EVIDENCE_DIR, 'settings-sync-group-discovery.png');

async function sendDiscovery(electronApp: ElectronApplication, snapshot: SyncGroupDiscoverySnapshot) {
  await electronApp.evaluate(({ BrowserWindow }, payload) => BrowserWindow.getAllWindows()
    .find((window) => !window.isDestroyed())?.webContents.send('foliole:sync-group-discovery-changed', payload), snapshot);
}

test('keeps Find Sync Group explainable until the settings surface closes', async ({
  desktopSession, desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    const target = globalThis as typeof globalThis & { __syncGroupDiscoveryStatuses?: string[] };
    target.__syncGroupDiscoveryStatuses = [];
    window.electronAPI?.onSyncGroupDiscoveryChanged?.((snapshot) => {
      target.__syncGroupDiscoveryStatuses?.push(snapshot.status);
    });
  });
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  const section = settings.getByLabel(/^(Sync section|同步设置区)$/);
  await section.getByRole('button', { name: /^(Find Sync Group|查找同步组)$/ }).click();
  await expect(section.getByText(/^(Searching for Sync Groups…|正在查找同步组…)$/)).toBeVisible();

  const candidate = {
    endpoint_url: 'http://192.168.0.12:38641', group_display_name: 'Daily Group',
    group_id: 'group-1', group_tag: 'tag-1', provider_authorization_id: 'desktop-a',
    provider_host_name: 'Mac A', provider_host_platform: 'darwin', timeline_id: 'timeline-1'
  };
  await sendDiscovery(desktopSession.electronApp, {
    candidates: [candidate], change: 'found', error_code: null, status: 'results'
  });
  await expect(section.getByText(/Daily Group/)).toBeVisible();
  await sendDiscovery(desktopSession.electronApp, {
    candidates: [{ ...candidate, group_display_name: 'Changed Group' }],
    change: 'changed', error_code: null, status: 'results'
  });
  await expect(section.getByText(/Changed Group/)).toBeVisible();
  await sendDiscovery(desktopSession.electronApp, {
    candidates: [], change: 'lost', error_code: null, status: 'searching'
  });
  await expect(section.getByText(/^(Searching for Sync Groups…|正在查找同步组…)$/)).toBeVisible();

  for (const [status, message] of [
    ['permission_required', /^(Allow Local Network access to find Sync Groups\.|请允许访问本地网络，以查找同步组。)$/],
    ['unavailable', /^(Sync Group discovery is unavailable\.|当前无法查找同步组。)$/],
    ['incompatible', /^(Nearby Sync Groups require a newer Foliole version\.|附近的同步组需要更新 Foliole。)$/],
    ['connection_failed', /^(A Sync Group was found, but Foliole could not connect\.|已找到同步组，但 Foliole 无法连接。)$/]
  ] as const) {
    await sendDiscovery(desktopSession.electronApp, {
      candidates: [], change: 'failed', error_code: status, status
    });
    await expect(section.getByText(message)).toBeVisible();
  }
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const screenshot = await section.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-sync-group-discovery', { body: screenshot, contentType: 'image/png' });

  await desktopWindow.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect.poll(() => desktopWindow.evaluate(() => (
    globalThis as typeof globalThis & { __syncGroupDiscoveryStatuses?: string[] }
  ).__syncGroupDiscoveryStatuses?.at(-1))).toBe('stopped');
});
