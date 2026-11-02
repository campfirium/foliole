import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyMacOsFontSmoothing,
  resolveMacOsFontSmoothingEnabled,
  supportsMacOsFontSmoothingSetting
} from './macOsFontSmoothing';

afterEach(() => {
  vi.restoreAllMocks();
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
    // jsdom does not implement this vendor property; Electron coverage verifies CSS application.
    const setProperty = vi.spyOn(root.style, 'setProperty');
    const removeProperty = vi.spyOn(root.style, 'removeProperty');

    applyMacOsFontSmoothing(true, root, true);
    expect(setProperty).toHaveBeenCalledWith('-webkit-font-smoothing', 'antialiased');

    applyMacOsFontSmoothing(false, root, true);
    expect(removeProperty).toHaveBeenCalledWith('-webkit-font-smoothing');
  });

  it('removes a stale override on unsupported renderers', () => {
    const root = document.documentElement;
    root.style.setProperty('-webkit-font-smoothing', 'antialiased');
    const removeProperty = vi.spyOn(root.style, 'removeProperty');

    applyMacOsFontSmoothing(true, root, false);

    expect(removeProperty).toHaveBeenCalledWith('-webkit-font-smoothing');
  });
});
