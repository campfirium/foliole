import { beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ platform: 'android', native: true, available: true, readClipboardText: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => host.platform, isNativePlatform: () => host.native,
    isPluginAvailable: () => host.available },
  registerPlugin: () => ({ readClipboardText: host.readClipboardText })
}));

import { readClipboardText } from './textClipboard';

beforeEach(() => {
  vi.resetAllMocks();
  host.native = true; host.platform = 'android'; host.available = true;
});

it.each(['android', 'ios'])('reads native %s text without changing whitespace', async platform => {
  host.platform = platform;
  host.readClipboardText.mockResolvedValue({ text: '  # Title\nText  ' });
  await expect(readClipboardText()).resolves.toBe('  # Title\nText  ');
});

it.each([false, true])('uses browser clipboard for web preview (native custom platform: %s)', async native => {
  host.native = native;
  host.platform = 'foliole-browser-preview';
  const readText = vi.fn(async () => 'Browser text');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
  await expect(readClipboardText()).resolves.toBe('Browser text');
  expect(host.readClipboardText).not.toHaveBeenCalled();
});

it('preserves native errors instead of falling back to browser clipboard', async () => {
  host.readClipboardText.mockRejectedValue(new Error('Denied'));
  await expect(readClipboardText()).rejects.toThrow('Denied');
});

it.each([null, {}, { text: 7 }])('rejects malformed native responses: %j', async result => {
  host.readClipboardText.mockResolvedValue(result);
  await expect(readClipboardText()).rejects.toThrow('Invalid text clipboard response');
});

it('rejects missing native plugin support', async () => {
  host.available = false;
  await expect(readClipboardText()).rejects.toThrow('unavailable');
  expect(host.readClipboardText).not.toHaveBeenCalled();
});
