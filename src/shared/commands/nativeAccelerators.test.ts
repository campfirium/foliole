import { describe, expect, it } from 'vitest';

import { resolveNativeMenuAccelerator } from './nativeAccelerators';

describe('resolveNativeMenuAccelerator', () => {
  it('uses the platform-matching shortcut when primary and secondary differ by OS modifier', () => {
    const shortcuts = {
      primary: { key: 'm', ctrlKey: true },
      secondary: { key: 'm', metaKey: true }
    };

    expect(resolveNativeMenuAccelerator(shortcuts, 'Win32')).toBe('Control+M');
    expect(resolveNativeMenuAccelerator(shortcuts, 'MacIntel')).toBe('Command+M');
  });

  it('allows function keys and rejects bare typing keys for native menus', () => {
    expect(resolveNativeMenuAccelerator({ primary: { key: 'F11' } }, 'Win32')).toBe('F11');
    expect(resolveNativeMenuAccelerator({ primary: { key: '1' } }, 'Win32')).toBe('');
    expect(resolveNativeMenuAccelerator({ primary: { key: ' ' } }, 'Win32')).toBe('');
  });
});
