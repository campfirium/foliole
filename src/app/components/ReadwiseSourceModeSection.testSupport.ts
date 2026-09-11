import { vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';

import type { ReadwiseApiModeSettings } from './ReadwiseApiModeSettingsRows';

export function createReadwiseApiModeTestSettings(): ReadwiseApiModeSettings {
  return {
    cleanupDisabled: false,
    config: createDefaultReadwiseReaderConfig(),
    onChangeFrequency: vi.fn(),
    onCleanup: vi.fn(),
    onSync: vi.fn(),
    syncDisabled: false,
    syncIsRunning: false,
    syncStatus: { failedSources: [], message: null, tone: 'normal' }
  };
}
