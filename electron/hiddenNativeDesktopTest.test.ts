// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { prepareHiddenNativeDesktopWindowCreation } from './hiddenNativeDesktopTest.js';

it('allows hidden macOS window creation only after the launch activation block', () => {
  const setActivationPolicy = vi.fn();

  expect(prepareHiddenNativeDesktopWindowCreation(
    { setActivationPolicy },
    { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' },
    'darwin'
  )).toBe(true);
  expect(setActivationPolicy).toHaveBeenCalledWith('accessory');
});

it('leaves visible and non-macOS window creation unchanged', () => {
  const setActivationPolicy = vi.fn();

  expect(prepareHiddenNativeDesktopWindowCreation(
    { setActivationPolicy },
    {},
    'darwin'
  )).toBe(false);
  expect(prepareHiddenNativeDesktopWindowCreation(
    { setActivationPolicy },
    { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' },
    'win32'
  )).toBe(false);
  expect(setActivationPolicy).not.toHaveBeenCalled();
});
