import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  normalizeReadwiseSourceMode,
  normalizeReadwiseSourceModeConflict,
  READWISE_SOURCE_MODE_CONFLICT_KEY,
  READWISE_SOURCE_MODE_KEY,
  type ReadwiseSourceModeCompletion,
  type ReadwiseSourceMode
} from '../../lib/core/import/readwiseSourceMode.js';

import { openDatabaseConnection } from './connection.js';
import { loadReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { loadJsonSetting, writeJsonSetting } from './settingsStore.js';

export interface ReadwiseSourceModeState {
  completion: ReadwiseSourceModeCompletion | null;
  conflictReasons: string[];
  mode: ReadwiseSourceMode;
}

export function ensureReadwiseSourceModeInitialized() {
  if (loadJsonSetting(READWISE_SOURCE_MODE_KEY) !== null) return;
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => writeMode(tx, 'relay'));
}

export function loadReadwiseSourceModeState(): ReadwiseSourceModeState {
  const setting = normalizeReadwiseSourceMode(loadJsonSetting(READWISE_SOURCE_MODE_KEY));
  const storedConflict = normalizeReadwiseSourceModeConflict(
    loadJsonSetting(READWISE_SOURCE_MODE_CONFLICT_KEY)
  );
  const reasons = new Set(storedConflict?.reasons ?? []);
  const cutover = loadReadwiseSourceCutover();
  const complete = cutover?.version === 2 && cutover.status === 'api'
    && cutover.completionVersion === 2;
  const proofMatches = complete && setting.completion
    && setting.completion.completedAt === cutover.completedAt
    && setting.completion.startedAt === cutover.startedAt
    && setting.completion.sourceHost === cutover.sourceHost
    && setting.completion.batchId === (cutover.batchId ?? null);
  if (setting.mode === 'api' && !proofMatches) reasons.add('api_without_completion_proof');
  if (setting.mode === 'relay' && cutover?.status === 'api') {
    reasons.add('completion_conflicts_with_mode');
  }
  if (setting.mode !== 'relay' && cutover?.status === 'migration-in-progress') {
    reasons.add('migration_conflicts_with_mode');
  }
  return {
    completion: proofMatches ? setting.completion ?? null : null,
    conflictReasons: [...reasons].sort(),
    mode: setting.mode
  };
}

export function saveReadwiseSourceMode(mode: ReadwiseSourceMode, now = new Date().toISOString()) {
  const current = loadReadwiseSourceModeState();
  if (current.conflictReasons.length > 0 && current.mode !== mode) {
    throw new Error('readwise_source_mode_conflict');
  }
  if (mode === 'api') {
    if (!current.completion) throw new Error('readwise_source_mode_completion_required');
  }
  openDatabaseConnection().driver.transaction((driver) => writeMode(
    driver, mode, now, current.completion ?? undefined
  ));
  return loadReadwiseSourceModeState();
}

export function writeReadwiseSourceMode(
  driver: DatabaseDriver,
  mode: ReadwiseSourceMode,
  now = new Date().toISOString(),
  completion?: ReadwiseSourceModeCompletion
) {
  writeMode(driver, mode, now, completion);
}

function writeMode(
  driver: DatabaseDriver,
  mode: ReadwiseSourceMode,
  now = new Date().toISOString(),
  completion?: ReadwiseSourceModeCompletion
) {
  if (mode === 'api' && !completion) throw new Error('readwise_source_mode_completion_required');
  writeJsonSetting(driver, READWISE_SOURCE_MODE_KEY, {
    ...(completion ? { completion } : {}), mode, version: 1
  }, now);
}
