import { afterEach, describe, expect, it } from 'vitest';

import {
  applyMacOsFontSmoothing,
  resolveMacOsFontSmoothingEnabled,
  supportsMacOsFontSmoothingSetting
} from './macOsFontSmoothing';

afterEach(() => {
  document.documentElement.style.removeProperty('-webkit-font-smoothing');
});

describe('macOS font smoothing platform contract', () => {
  it('only supports an Electron renderer on macOS', () => {
    expect(supportsMacOsFontSmoothingSetting('MacIntel', 'Electron', true)).toBe(true);
    expect(supportsMacOsFontSmoothingSetting('MacIntel', 'Safari', false)).toBe(false);
    expect(supportsMacOsFontSmoothingSetting('Win32', 'Electron', true)).toBe(false);
  });

  it('defaults to enabled and only treats explicit false as disabled', () => {
    expect(resolveMacOsFontSmoothingEnabled(undefined)).toBe(true);
    expect(resolveMacOsFontSmoothingEnabled(null)).toBe(true);
    expect(resolveMacOsFontSmoothingEnabled('true')).toBe(true);
    expect(resolveMacOsFontSmoothingEnabled('false')).toBe(false);
  });

  it('applies antialiased when enabled and removes the override when disabled', () => {
    const root = document.documentElement;

    applyMacOsFontSmoothing(true, root, true);
    expect(root.style.getPropertyValue('-webkit-font-smoothing')).toBe('antialiased');

    applyMacOsFontSmoothing(false, root, true);
    expect(root.style.getPropertyValue('-webkit-font-smoothing')).toBe('');
  });

  it('removes a stale override on unsupported renderers', () => {
    const root = document.documentElement;
    root.style.setProperty('-webkit-font-smoothing', 'antialiased');

    applyMacOsFontSmoothing(true, root, false);

    expect(root.style.getPropertyValue('-webkit-font-smoothing')).toBe('');
  });
});
