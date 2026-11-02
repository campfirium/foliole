import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getDemoRuntimeState, installDemoRuntimeController } from './runtime/demoRuntime';
import { saveWhitelistedLocalStorageItem } from './storage';

const demo = { enabled: false };
const initial = getDemoRuntimeState();
installDemoRuntimeController({
  getState: () => ({ ...initial, isDemo: demo.enabled }),
  clearLocalData: async () => false, continueToNextPreviewDay: () => undefined,
  getNowIso: (now) => now.toISOString(),
  importMarkdown: async () => ({ ignoredCount: 0, importedTopicCount: 0 }),
  subscribe: () => () => undefined
});
const invoke = vi.fn();
beforeEach(() => {
  demo.enabled = false;
  window.localStorage.clear();
  invoke.mockReset().mockResolvedValue(null);
  window.electronAPI = { invoke: invoke as NativeInvoke } as NonNullable<typeof window.electronAPI>;
});

it('saves an explicit Demo reading preference in browser storage without requiring a native host', async () => {
  demo.enabled = true;
  delete window.electronAPI;
  const key = APP_SETTINGS_STORAGE_KEYS.readingFontWeight;
  expect(await saveWhitelistedLocalStorageItem(key, '450')).toBe(true);
  expect(window.localStorage.getItem(key)).toBe('450');
  expect(invoke).not.toHaveBeenCalled();
});

it('continues reporting a native persistence failure instead of accepting a renderer-only value', async () => {
  invoke.mockRejectedValueOnce(new Error('native write failed'));
  expect(await saveWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.readingFontWeight, '450')).toBe(false);
  expect(invoke).toHaveBeenCalledOnce();
});

it('does not report a successful Demo save when browser storage rejects the write', async () => {
  demo.enabled = true;
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  try {
    expect(await saveWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.readingFontWeight, '450')).toBe(false);
  } finally {
    write.mockRestore();
  }
});
