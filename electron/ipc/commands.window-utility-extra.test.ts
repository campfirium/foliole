// @vitest-environment node
import path from 'node:path';

import { expect, it } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

import './commands.window-utility-extra.test-support.js';

import { handleInvokeRequest } from './commands.js';
import { drainDirtyNodeSyncVersions, mockApp, mockWindow, openExternal, openPath,
  requestDevShellRestart, syncAppMenuState } from './commands.window-utility-extra.test-support.js';

it('loads unsupported login item settings outside the packaged Windows app', async () => {
  await expect(handleInvokeRequest({ command: 'load_login_item_settings' })).resolves.toEqual({
    enabled: false,
    effective: false,
    status: 'unsupported',
    supported: false
  });

  expect(mockApp.getLoginItemSettings).not.toHaveBeenCalled();
});

it('saves login item settings only when supported', async () => {
  await expect(handleInvokeRequest({
    command: 'save_login_item_settings',
    args: { enabled: true }
  })).resolves.toEqual({
    enabled: false,
    effective: false,
    status: 'unsupported',
    supported: false
  });

  expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
});

it('handles typed native utility commands', async () => {
  const openExternalUrlRequest = {
    command: 'open_external_url',
    args: { url: 'https://example.com' }
  } satisfies NativeInvokeRequest<'open_external_url'>;
  const openLocalPathRequest = {
    command: 'open_local_path',
    args: { path: '/log/source.md' }
  } satisfies NativeInvokeRequest<'open_local_path'>;

  await expect(handleInvokeRequest(openExternalUrlRequest)).resolves.toBeNull();
  await expect(handleInvokeRequest(openLocalPathRequest)).resolves.toBeNull();
  if (process.platform === 'darwin') {
    const openSettingsRequest: NativeInvokeRequest<'open_sync_group_local_network_settings'> = {
      command: 'open_sync_group_local_network_settings'
    };
    await expect(handleInvokeRequest(openSettingsRequest)).resolves.toBeNull();
    expect(openPath).toHaveBeenCalledWith('/System/Applications/System Settings.app');
  }
  await expect(handleInvokeRequest({
    command: 'sync_app_menu_state',
    args: { enabledCommandIds: ['node.create'], shortcutAccelerators: [] }
  } satisfies NativeInvokeRequest<'sync_app_menu_state'>)).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'copy_diagnostic_report' })).resolves.toEqual({
    report_text: '# Foliole Diagnostic Report',
    status: 'generated'
  });
  expect(openExternal).toHaveBeenCalledWith('https://example.com');
  expect(openPath).toHaveBeenCalledWith(path.normalize('/log/source.md'));
  expect(syncAppMenuState).toHaveBeenCalledWith(['node.create'], [], undefined, undefined);
});

it('does not open rejected local paths through the native utility command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: 'file:///tmp/source.md' }
    })
  ).resolves.toBeNull();
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: '/tmp/install.exe' }
    })
  ).resolves.toBeNull();
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: '/tmp' }
    })
  ).resolves.toBeNull();

  expect(openPath).not.toHaveBeenCalled();
});

it('opens app-managed log directories through the native utility command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'open_local_path',
      args: { path: '/log' }
    })
  ).resolves.toBeNull();

  expect(openPath).toHaveBeenCalledWith(path.normalize('/log'));
});

it('handles the dev app restart command through a shell restart request', async () => {
  requestDevShellRestart.mockReturnValue(true);

  await expect(handleInvokeRequest({ command: 'window_restart_dev_app' })).resolves.toBeNull();

  expect(requestDevShellRestart).toHaveBeenCalledWith({ reason: 'in-app-dev-restart' });
  expect(mockApp.relaunch).not.toHaveBeenCalled();
  expect(mockApp.exit).toHaveBeenCalledWith(0);
});

it('handles window commands through invoke channel', async () => {
  await expect(handleInvokeRequest({ command: 'window_minimize' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_restart_app' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_toggle_dev_tools' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_toggle_maximize' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_close' })).resolves.toBeNull();
  await expect(handleInvokeRequest({ command: 'window_is_maximized' })).resolves.toBe(false);

  expect(mockWindow.minimize).toHaveBeenCalledTimes(1);
  expect(mockApp.relaunch).toHaveBeenCalledTimes(1);
  expect(mockApp.exit).toHaveBeenCalledWith(0);
  expect(mockWindow.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
  expect(mockWindow.maximize).toHaveBeenCalledTimes(1);
  if (process.platform === 'win32') {
    expect(mockWindow.hide).toHaveBeenCalledTimes(1);
    expect(mockWindow.close).not.toHaveBeenCalled();
  } else {
    expect(mockWindow.hide).not.toHaveBeenCalled();
    expect(mockWindow.close).toHaveBeenCalledTimes(1);
  }
});

it('does not open DevTools from packaged native window command', async () => {
  mockApp.isPackaged = true;

  await expect(handleInvokeRequest({ command: 'window_toggle_dev_tools' })).resolves.toBeNull();

  expect(mockWindow.webContents.toggleDevTools).not.toHaveBeenCalled();
});

it('flushes dirty node sync versions through invoke channel', async () => {
  await expect(
    handleInvokeRequest({
      command: 'flush_dirty_node_sync_versions'
    } satisfies NativeInvokeRequest<'flush_dirty_node_sync_versions'>)
  ).resolves.toEqual(['node-1']);

  expect(drainDirtyNodeSyncVersions).toHaveBeenCalledWith('foreground');
});

it('restores window when toggle command runs while maximized', async () => {
  mockWindow.isMaximized.mockReturnValue(true);

  await expect(handleInvokeRequest({ command: 'window_toggle_maximize' })).resolves.toBeNull();
  expect(mockWindow.unmaximize).toHaveBeenCalledTimes(1);
});
