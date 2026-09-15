import { vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';

import type { ReadwiseApiModeSettings } from './ReadwiseApiModeSettingsRows';

export function createReadwiseApiModeTestSettings(): ReadwiseApiModeSettings {
  return {
    config: createDefaultReadwiseReaderConfig(),
    onChangeFrequency: vi.fn(),
    onSync: vi.fn(),
    syncDisabled: false,
    syncIsRunning: false,
    syncStatus: { failedSources: [], message: null, tone: 'normal' }
  };
}
