import { expect, it, vi } from 'vitest';

import { createOpenSettingsHandler } from './settingsOverlayRequest';

it('opens settings with an optional row target', () => {
  const runtime = {
    setIsSettingsOpen: vi.fn(),
    setRequestedSettingsCategory: vi.fn(),
    setRequestedSettingsDialog: vi.fn(),
    setRequestedSettingsRowId: vi.fn()
  };

  createOpenSettingsHandler(runtime as never)('general', 'general-models');

  expect(runtime.setRequestedSettingsDialog).toHaveBeenCalledWith(null);
  expect(runtime.setRequestedSettingsCategory).toHaveBeenCalledWith('general');
  expect(runtime.setRequestedSettingsRowId).toHaveBeenCalledWith('general-models');
  expect(runtime.setIsSettingsOpen).toHaveBeenCalledWith(true);
});
