import {
  normalizeReadwiseSourceCutover,
  READWISE_SOURCE_CUTOVER_KEY,
  READWISE_SOURCE_CUTOVER_VERSION,
  type ReadwiseSourceCutover
} from '../../lib/core/readwise/readwiseSourceCutover.js';

import { openDatabaseConnection } from './connection.js';
import { loadJsonSetting, writeJsonSetting } from './settingsStore.js';

export function loadReadwiseSourceCutover() {
  return normalizeReadwiseSourceCutover(loadJsonSetting(READWISE_SOURCE_CUTOVER_KEY));
}

export function writeReadwiseSourceCutover(
  input: Omit<ReadwiseSourceCutover, 'version'>,
  now = input.completedAt
) {
  const value = { ...input, version: READWISE_SOURCE_CUTOVER_VERSION };
  openDatabaseConnection().driver.transaction((driver) => {
    writeJsonSetting(driver, READWISE_SOURCE_CUTOVER_KEY, value, now);
  });
  return value;
}
