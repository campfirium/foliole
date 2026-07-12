// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { clickWindowsScreenPoint } from './windows-native-mouse-click.mjs';

describe('Windows native mouse validation adapter', () => {
  it('uses a fixed PowerShell file with validated scalar arguments', () => {
    const run = vi.fn(() => ({ status: 0 }));
    clickWindowsScreenPoint({ hwndHex: '0011223344556677', x: 120, y: 240 }, run);
    const [bin, args] = run.mock.calls[0];
    expect(bin).toBe('powershell.exe');
    expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-File', '-HwndHex', '0011223344556677', '-X', '120', '-Y', '240']));
    expect(args).not.toEqual(expect.arrayContaining(['-Command', '-ExecutionPolicy', 'Bypass']));
  });

  it('rejects untrusted handles and maps host policy failures', () => {
    expect(() => clickWindowsScreenPoint({ hwndHex: 'bad', x: 1, y: 2 }, vi.fn())).toThrow('invalid native window handle');
    try {
      clickWindowsScreenPoint(
        { hwndHex: '0011223344556677', x: 1, y: 2 },
        () => ({ status: 1, stderr: 'blocked by policy' })
      );
      throw new Error('expected adapter failure');
    } catch (error) {
      expect(error.code).toBe('native_mouse_adapter_blocked');
    }
  });
});
