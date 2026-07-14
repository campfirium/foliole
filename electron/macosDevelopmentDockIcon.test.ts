// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { applyMacosDevelopmentDockIcon } from './macosDevelopmentDockIcon.js';

it('applies the Foliole dock icon to an unpackaged macOS runtime', () => {
  const setIcon = vi.fn();

  expect(applyMacosDevelopmentDockIcon(
    { dock: { setIcon }, isPackaged: false },
    '/repo/build/icon.png',
    'darwin'
  )).toBe(true);
  expect(setIcon).toHaveBeenCalledWith('/repo/build/icon.png');
});

it('leaves packaged and non-macOS runtime identity unchanged', () => {
  const setIcon = vi.fn();

  expect(applyMacosDevelopmentDockIcon(
    { dock: { setIcon }, isPackaged: true },
    '/repo/build/icon.png',
    'darwin'
  )).toBe(false);
  expect(applyMacosDevelopmentDockIcon(
    { dock: { setIcon }, isPackaged: false },
    '/repo/build/icon.png',
    'win32'
  )).toBe(false);
  expect(setIcon).not.toHaveBeenCalled();
});
