import { describe, expect, it } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
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

  it('projects DOM arrow keys to Electron accelerator key names', () => {
    expect(resolveNativeMenuAccelerator({ primary: { key: 'ArrowLeft', metaKey: true } }, 'MacIntel')).toBe('Command+Left');
    expect(resolveNativeMenuAccelerator({ primary: { key: 'ArrowDown', ctrlKey: true } }, 'Win32')).toBe('Control+Down');
  });

  it('projects the annotation default to each desktop native accelerator', () => {
    const mac = getPlatformDefaultCommandShortcuts('MacIntel')[APP_COMMAND_IDS.addSelectionNote];
    const windows = getPlatformDefaultCommandShortcuts('Win32')[APP_COMMAND_IDS.addSelectionNote];
    const linux = getPlatformDefaultCommandShortcuts('Linux x86_64')[APP_COMMAND_IDS.addSelectionNote];

    expect(resolveNativeMenuAccelerator(mac, 'MacIntel')).toBe('Command+Shift+A');
    expect(resolveNativeMenuAccelerator(windows, 'Win32')).toBe('Alt+A');
    expect(resolveNativeMenuAccelerator(linux, 'Linux x86_64')).toBe('Alt+A');
  });
});
