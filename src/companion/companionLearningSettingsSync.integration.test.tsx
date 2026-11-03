import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { writeSettingRecord } from '../../electron/database/settingRecords';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';

import { openLearningSetting, changeLearningSetting } from './companionLearningSettings.testSupport';
import { CompanionLearningSettingsContent } from './CompanionLearningSettingsContent';
import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T08:00:00Z'));
  library = await createSearchLibrary(0);
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});
afterEach(async () => { await library.close(); await closeLibraries(); vi.useRealTimers(); });

it('exchanges saved settings with an independent desktop and merges a later mobile edit into received preferences', async () => {
  const peers = await connectCompanionPeer(library);
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Desired retention', '0.82');
  await peers.exchange();
  const mobile = getCurrentReviewSchedulerSettings();
  const incoming = { ...mobile, desiredRetention: 0.86, newItemLoadBalancingDays: 21,
    pushQueue: { ...mobile.pushQueue, priorityRatio: 4 } };
  vi.setSystemTime(new Date('2026-11-03T08:00:01Z'));
  writeSettingRecord(peers.desktop.driver, { key: 'review_scheduler_settings', valueJson: JSON.stringify(incoming),
    updatedAt: new Date().toISOString() });
  await peers.exchange();
  await hydrateCompanionReviewSchedulerSettings();
  expect(await openLearningSetting('Desired retention')).toHaveValue(0.86);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await openLearningSetting('New item load balancing')).toHaveValue(21);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  vi.setSystemTime(new Date('2026-11-03T08:00:02Z'));
  await changeLearningSetting('Maximum interval days', '120');
  expect(getCurrentReviewSchedulerSettings()).toMatchObject({ desiredRetention: 0.86,
    newItemLoadBalancingDays: 21, maximumIntervalDays: 120, pushQueue: { priorityRatio: 4 } });
  await peers.exchange();
  const read = (db: typeof library.database) => JSON.parse((db.prepare(`SELECT value_json FROM setting_records
    WHERE key='review_scheduler_settings' AND scope='user_space' ORDER BY updated_at DESC,content_hash DESC LIMIT 1`)
    .get() as { value_json: string }).value_json);
  expect(read(peers.desktop.db)).toEqual(read(library.database));
  expect(read(library.database)).toMatchObject({ desiredRetention: 0.86, maximumIntervalDays: 120 });
});

it('resolves simultaneous mobile and desktop preferences consistently after a real exchange', async () => {
  const peers = await connectCompanionPeer(library);
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Desired retention', '0.82');
  await peers.exchange();
  const base = getCurrentReviewSchedulerSettings();
  vi.setSystemTime(new Date('2026-11-03T08:00:01Z'));
  await changeLearningSetting('Desired retention', '0.76');
  writeSettingRecord(peers.desktop.driver, { key: 'review_scheduler_settings',
    valueJson: JSON.stringify({ ...base, desiredRetention: 0.88 }), updatedAt: new Date().toISOString() });
  await peers.exchange();
  const canonical = (db: typeof library.database) => JSON.parse((db.prepare(`SELECT value_json FROM setting_records
    WHERE key='review_scheduler_settings' AND scope='user_space' ORDER BY updated_at DESC,content_hash DESC LIMIT 1`)
    .get() as { value_json: string }).value_json);
  expect(canonical(library.database)).toEqual(canonical(peers.desktop.db));
  await hydrateCompanionReviewSchedulerSettings();
  expect(getCurrentReviewSchedulerSettings().desiredRetention).toBe(canonical(library.database).desiredRetention);
});
