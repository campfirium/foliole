// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { applyMacosDockPresentation } from './macosDevelopmentDockIcon.js';

it('hides unpackaged macOS hidden-native runtimes instead of publishing a dock icon', () => {
  const hide = vi.fn();
  const setActivationPolicy = vi.fn();
  const setIcon = vi.fn();

  expect(applyMacosDockPresentation(
    { dock: { hide, setIcon }, isPackaged: false, setActivationPolicy },
    '/repo/build/icon.png',
    'darwin',
    { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' }
  )).toBe(true);
  expect(setActivationPolicy).toHaveBeenCalledWith('prohibited');
  expect(hide).toHaveBeenCalledOnce();
  expect(setIcon).not.toHaveBeenCalled();
});

it('applies the Foliole dock icon to a normal unpackaged macOS runtime', () => {
  const hide = vi.fn();
  const setIcon = vi.fn();

  expect(applyMacosDockPresentation(
    { dock: { hide, setIcon }, isPackaged: false },
    '/repo/build/icon.png',
    'darwin'
  )).toBe(true);
  expect(hide).not.toHaveBeenCalled();
  expect(setIcon).toHaveBeenCalledWith('/repo/build/icon.png');
});

it('leaves packaged and non-macOS runtime presentation unchanged', () => {
  const hide = vi.fn();
  const setIcon = vi.fn();

  expect(applyMacosDockPresentation(
    { dock: { hide, setIcon }, isPackaged: true },
    '/repo/build/icon.png',
    'darwin'
  )).toBe(false);
  expect(applyMacosDockPresentation(
    { dock: { hide, setIcon }, isPackaged: false },
    '/repo/build/icon.png',
    'win32'
  )).toBe(false);
  expect(hide).not.toHaveBeenCalled();
  expect(setIcon).not.toHaveBeenCalled();
});
