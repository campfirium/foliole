import { expect, it, vi } from 'vitest';

import { createOpenSettingsHandler } from './settingsOverlayRequest';

function createRuntime() {
  return {
    setIsSettingsOpen: vi.fn(),
    setRequestedSettingsCategory: vi.fn(),
    setRequestedSettingsDialog: vi.fn(),
    setRequestedSettingsRowId: vi.fn()
  };
}

it('opens settings with an optional row target', () => {
  const runtime = createRuntime();

  createOpenSettingsHandler(runtime as never)('general', 'general-models');

  expect(runtime.setRequestedSettingsDialog).toHaveBeenCalledWith(null);
  expect(runtime.setRequestedSettingsCategory).toHaveBeenCalledWith('general');
  expect(runtime.setRequestedSettingsRowId).toHaveBeenCalledWith('general-models');
  expect(runtime.setIsSettingsOpen).toHaveBeenCalledWith(true);
});

it('does not treat a forwarded click event as a settings category', () => {
  const runtime = {
    setIsSettingsOpen: vi.fn(),
    setRequestedSettingsCategory: vi.fn(),
    setRequestedSettingsDialog: vi.fn(),
    setRequestedSettingsRowId: vi.fn()
  };

  createOpenSettingsHandler(runtime as never)({ type: 'click' } as never);

  expect(runtime.setRequestedSettingsDialog).toHaveBeenCalledWith(null);
  expect(runtime.setRequestedSettingsCategory).toHaveBeenCalledWith(null);
  expect(runtime.setRequestedSettingsRowId).toHaveBeenCalledWith(null);
  expect(runtime.setIsSettingsOpen).toHaveBeenCalledWith(true);
});
