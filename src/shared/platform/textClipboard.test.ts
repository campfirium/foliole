import { beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ platform: 'android', native: true, available: true, readClipboardText: vi.fn(), writeClipboardText: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => host.platform, isNativePlatform: () => host.native,
    isPluginAvailable: () => host.available },
  registerPlugin: () => ({ readClipboardText: host.readClipboardText, writeClipboardText: host.writeClipboardText })
}));

import { readClipboardText, writeClipboardText } from './companion/runtime/textClipboard';

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

it.each(['android', 'ios'])('writes native %s text without changing whitespace', async platform => {
  host.platform = platform;
  host.writeClipboardText.mockResolvedValue(undefined);
  await writeClipboardText('  Beta\nGamma  ');
  expect(host.writeClipboardText).toHaveBeenCalledExactlyOnceWith({ text: '  Beta\nGamma  ' });
});

it.each([false, true])('writes browser preview clipboard (native: %s)', async native => {
  host.native = native;
  host.platform = 'foliole-browser-preview';
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await writeClipboardText('  Browser\ntext  ');
  expect(writeText).toHaveBeenCalledExactlyOnceWith('  Browser\ntext  ');
  expect(host.writeClipboardText).not.toHaveBeenCalled();
});

it('rejects native copy failures without writing to browser clipboard', async () => {
  const writeText = vi.fn();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  host.writeClipboardText.mockRejectedValue(new Error('Denied'));
  await expect(writeClipboardText('Text')).rejects.toThrow('Denied');
  expect(writeText).not.toHaveBeenCalled();
});

it('rejects copy when the native plugin is missing', async () => {
  host.available = false;
  await expect(writeClipboardText('Text')).rejects.toThrow('unavailable');
  expect(host.writeClipboardText).not.toHaveBeenCalled();
});

it('rejects copy when the browser clipboard is unavailable', async () => {
  host.platform = 'foliole-browser-preview';
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  await expect(writeClipboardText('Text')).rejects.toThrow('unavailable');
});
