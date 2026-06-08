// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

import { handleWindowAndUtilityCommand } from './windowCommands.js';

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getFocusedWindow: vi.fn()
  },
  app: {
    exit: vi.fn(),
    getVersion: vi.fn(() => '1.0.0'),
    relaunch: vi.fn()
  },
  shell: { openExternal }
}));

beforeEach(() => {
  openExternal.mockClear();
});

it('opens allowed external URL protocols through Electron shell', async () => {
  await expect(
    handleWindowAndUtilityCommand({
      command: 'open_external_url',
      args: { url: 'https://example.com/docs' }
    } satisfies NativeInvokeRequest<'open_external_url'>)
  ).resolves.toBeNull();
  await expect(
    handleWindowAndUtilityCommand({
      command: 'open_external_url',
      args: { url: 'mailto:hello@foliole.app?subject=Foliole%20feedback' }
    } satisfies NativeInvokeRequest<'open_external_url'>)
  ).resolves.toBeNull();

  expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  expect(openExternal).toHaveBeenCalledWith('mailto:hello@foliole.app?subject=Foliole%20feedback');
});

it('ignores unsafe external URL protocols before Electron shell open', async () => {
  await expect(
    handleWindowAndUtilityCommand({
      command: 'open_external_url',
      args: { url: 'javascript:alert(1)' }
    } satisfies NativeInvokeRequest<'open_external_url'>)
  ).resolves.toBeNull();
  await expect(
    handleWindowAndUtilityCommand({
      command: 'open_external_url',
      args: { url: 'file:///tmp/source.md' }
    } satisfies NativeInvokeRequest<'open_external_url'>)
  ).resolves.toBeNull();

  expect(openExternal).not.toHaveBeenCalled();
});
