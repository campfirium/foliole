import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';

import { openLearningSetting, changeLearningSetting } from './companionLearningSettings.testSupport';
import { CompanionLearningSettingsContent } from './CompanionLearningSettingsContent';

const runtime = vi.hoisted(() => ({ platform: 'android' }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => runtime.platform, isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const values = [
  ['Desired retention', '0.82'], ['Maximum interval days', '120'], ['New day starts at', '7'],
  ['New item load balancing', '14'], ['Default topic priority', '6'], ['Priority weight', '3'],
  ['Reading queue mix ratio', '2'], ['Review item queue mix ratio', '3'], ['Reading initial interval days', '1.5'],
  ['Reading growth factor min', '1.2'], ['Reading growth factor max', '1.8']
] as const;
let root = '';
let sqlite: Database.Database | null = null;

async function open(platform: 'android' | 'ios') {
  const file = path.join(root, 'library.db');
  const existed = existsSync(file);
  sqlite = new Database(file);
  await initializeIosCompanionDatabase({ booted_at: '2026-11-03T00:00:00Z', database_path: null,
    database_ready: false, host_name: 'Learning fixture', runtime_kind: `${platform}-capacitor` },
  createFakeCapacitorDatabaseManager(sqlite, existed, () => { sqlite = null; }));
}
afterEach(async () => {
  await closeIosCompanionDatabase();
  if (sqlite?.open) sqlite.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

it.each(['android', 'ios'] as const)('saves all nine settings through the %s owner and restores every control after reopening', async platform => {
  runtime.platform = platform;
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-learning-'));
  await open(platform);
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  const ui = render(<CompanionLearningSettingsContent />);
  for (const [label, value] of values) await changeLearningSetting(label, value);
  const expected = getCurrentReviewSchedulerSettings();
  expect(expected).toMatchObject({ desiredRetention: 0.82, maximumIntervalDays: 120,
    newDayStartsAtHour: 7, newItemLoadBalancingDays: 14,
    pushQueue: { defaultPriority: 6, priorityRatio: 3, queueMixRatio: { reading: 2, fsrs: 3 },
      readingInitialIntervalMs: 129_600_000, readingIntervalGrowthFactorRange: { min: 1.2, max: 1.8 } } });
  expect(sqlite!.prepare('SELECT scope,platform,host_name FROM setting_records').all())
    .toEqual([{ scope: 'user_space', platform, host_name: '*' }]);
  ui.unmount();
  await closeIosCompanionDatabase();
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  await open(platform);
  render(<CompanionLearningSettingsContent />);
  for (const [label, value] of values) {
    const control = await openLearningSetting(label);
    expect(control).toHaveValue(control instanceof HTMLSelectElement ? value : Number(value));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  }
  expect(getCurrentReviewSchedulerSettings()).toEqual(expected);
});

it.each([
  ['Desired retention', '1'], ['Maximum interval days', '0'], ['New day starts at', '24'],
  ['New item load balancing', '100'], ['Default topic priority', '0'], ['Priority weight', '0'],
  ['Reading queue mix ratio', '0'], ['Review item queue mix ratio', '0'], ['Reading initial interval days', '0'],
  ['Reading growth factor min', '0'], ['Reading growth factor max', '0']
])('rejects invalid %s without changing persisted settings', async (label, value) => {
  runtime.platform = 'android';
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-learning-'));
  await open('android');
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  render(<CompanionLearningSettingsContent />);
  const input = await openLearningSetting(label);
  fireEvent.change(input, { target: { value } });
  if (input instanceof HTMLInputElement) fireEvent.submit(input.closest('form')!);
  expect(sqlite!.prepare('SELECT * FROM setting_records').all()).toEqual([]);
  expect(getCurrentReviewSchedulerSettings()).toEqual(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});


it('keeps paired growth limits ordered when either endpoint crosses the other', async () => {
  runtime.platform = 'android';
  root = mkdtempSync(path.join(os.tmpdir(), 'mobile-learning-'));
  await open('android');
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Reading growth factor min', '2');
  expect(getCurrentReviewSchedulerSettings().pushQueue.readingIntervalGrowthFactorRange).toEqual({ min: 2, max: 2 });
  expect(await openLearningSetting('Reading growth factor max')).toHaveValue(2);
  await changeLearningSetting('Reading growth factor max', '1.1');
  expect(getCurrentReviewSchedulerSettings().pushQueue.readingIntervalGrowthFactorRange).toEqual({ min: 1.1, max: 1.1 });
  expect(await openLearningSetting('Reading growth factor min')).toHaveValue(1.1);
});
