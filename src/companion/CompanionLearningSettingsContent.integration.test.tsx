import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readNodeReviewHistoryWithDb } from '../../lib/core/database/reviewProjection';
import { recomputeReview } from '../../lib/core/review/recomputeReview';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { saveIosReviewWithDb } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { openLearningSetting, changeLearningSetting as changeSetting } from './companionLearningSettings.testSupport';
import { CompanionLearningSettingsContent } from './CompanionLearningSettingsContent';
import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});
afterEach(async () => { await library.close(); });

function SettingsEntry() {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  return renderCompanionSettingsContent({ settingsPage, onBackToSettingsList: () => setSettingsPage('list'),
    onOpenSyncSettings: () => setSettingsPage('sync'), onOpenSyncSettingsPage: setSettingsPage,
    workspaceSync: {} as never });
}

it('saves retention from the mobile form, keeps existing facts, grades with it and hydrates after reopening', async () => {
  library.database.prepare(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES ('item','item','Question','Original','2026-10-01','2026-10-01')`).run();
  const score = (opId: string, reviewedAt: string) => writeIosCompanionDatabase(db => db.transaction(tx =>
    saveIosReviewWithDb(tx, { node_id: 'item', review_json: '{}', review_log_json: JSON.stringify({
      opId, grade: 3, reviewedAt, schedulerVersion: 'test' }) })));
  await score('first', '2026-10-01T08:00:00Z');
  const before = library.database.prepare('SELECT * FROM node_review').all();
  const facts = library.database.prepare('SELECT * FROM review_log').all();
  const ui = render(<SettingsEntry />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  await changeSetting('Desired retention', '0.85');
  expect(getCurrentReviewSchedulerSettings().desiredRetention).toBe(0.85);
  expect(library.database.prepare('SELECT * FROM node_review').all()).toEqual(before);
  expect(library.database.prepare('SELECT * FROM review_log').all()).toEqual(facts);
  expect(library.database.prepare("SELECT content FROM nodes WHERE id='item'").get()).toEqual({ content: 'Original' });
  const saved = library.database.prepare("SELECT scope,value_json FROM setting_records WHERE key='review_scheduler_settings'").get() as { scope: string; value_json: string };
  expect(saved.scope).toBe('user_space');
  expect(JSON.parse(saved.value_json).desiredRetention).toBe(0.85);
  expect(library.database.prepare("SELECT object_id FROM sync_object_state WHERE object_type='setting'").all()).toHaveLength(1);
  await score('second', '2026-10-06T08:00:00Z');
  const history = await readIosCompanionDatabase(db => readNodeReviewHistoryWithDb(db, 'item'));
  expect(history.parameters.desiredRetention).toBe(0.85);
  const expected = recomputeReview(history.events, history.parameters, 'item')!;
  expect(library.database.prepare("SELECT due FROM node_review WHERE node_id='item'").get()).toEqual({ due: expected.due });
  ui.unmount();
  await reopenSearchLibrary(library.root, '2026-11-03T09:00:00Z');
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  render(<CompanionLearningSettingsContent />);
  expect(await openLearningSetting('Desired retention')).toHaveValue(0.85);
});

it.each(['setting_records', 'sync_object_state'])('keeps the saved value on %s write failure and retries the same draft', async table => {
  render(<CompanionLearningSettingsContent />);
  const input = await openLearningSetting('Desired retention');
  library.database.exec(`CREATE TRIGGER reject_setting BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'full'); END`);
  fireEvent.change(input, { target: { value: '0.8' } });
  fireEvent.submit(input.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Changes could not be saved');
  expect(getCurrentReviewSchedulerSettings().desiredRetention).toBe(0.9);
  expect(library.database.prepare('SELECT * FROM setting_records').all()).toEqual([]);
  library.database.exec('DROP TRIGGER reject_setting');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  await vi.waitFor(() => expect(getCurrentReviewSchedulerSettings().desiredRetention).toBe(0.8));
  expect(getCurrentReviewSchedulerSettings().desiredRetention).toBe(0.8);
});

it('shows a load failure instead of letting a malformed persisted setting be overwritten', async () => {
  library.database.prepare(`INSERT INTO setting_records (key,scope,platform,form_factor,host_name,value_json,content_hash,updated_at) VALUES ('review_scheduler_settings','user_space','android','phone','*','bad','hash','now')`).run();
  render(<CompanionLearningSettingsContent />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Review settings could not be loaded');
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  library.database.prepare('DELETE FROM setting_records').run();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  expect(await openLearningSetting('Desired retention')).toHaveValue(0.9);
});

it('uses the saved maximum in subsequent reviews with the unchanged shared scheduler', async () => {
  library.database.prepare(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES ('item','item','Question','Original','2026-10-01','2026-10-01')`).run();
  render(<CompanionLearningSettingsContent />);
  await changeSetting('Maximum interval days', '10');
  for (const [opId, reviewedAt] of [['one', '2026-10-01T08:00:00Z'], ['two', '2026-10-20T08:00:00Z']]) {
    await writeIosCompanionDatabase(db => db.transaction(tx => saveIosReviewWithDb(tx, {
      node_id: 'item', review_json: '{}', review_log_json: JSON.stringify({ opId, grade: 4, reviewedAt, schedulerVersion: 'test' })
    })));
  }
  const history = await readIosCompanionDatabase(db => readNodeReviewHistoryWithDb(db, 'item'));
  expect(history.parameters.maximumIntervalDays).toBe(10);
  const uncapped = recomputeReview(history.events, { ...history.parameters, maximumIntervalDays: 36500 })!;
  const actual = library.database.prepare("SELECT scheduled_days FROM node_review WHERE node_id='item'").get() as { scheduled_days: number };
  expect(actual.scheduled_days).toBeLessThan(uncapped.scheduled_days);
});

it('applies new-item balancing to real cloze creation without moving existing due dates', async () => {
  library.database.prepare(`INSERT INTO nodes (id,title,content,created_at,updated_at)
    VALUES ('source','Source','Original selected words','2026-10-01','2026-10-01')`).run();
  render(<CompanionLearningSettingsContent />);
  await changeSetting('New item load balancing', '1');
  async function createCloze() {
    const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
    const result = await persistCompanionSelectionAnnotation({ deviceId: 'Search', kind: 'cloze', snapshot,
      payload: { anchorId: crypto.randomUUID(), parentNodeId: 'source', clozeContent: 'Original [...]',
        selectionText: 'selected words', entries: [{ locator: { from: 9, to: 23, originalText: 'selected words' } }] } });
    expect(result).not.toBeNull();
    return library.database.prepare('SELECT due FROM node_review WHERE node_id=?').get(result!.nodeId) as { due: string };
  }
  const first = await createCloze();
  expect(await createCloze()).toEqual(first);
  const before = library.database.prepare('SELECT * FROM node_review ORDER BY node_id').all();
  await changeSetting('New item load balancing', '2');
  expect(library.database.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(before);
  const third = await createCloze();
  expect(Date.parse(third.due)).toBeGreaterThan(Date.parse(first.due));
});

it('confirms precise input and cancels a later edit without saving on blur', async () => {
  render(<CompanionLearningSettingsContent />);
  await changeSetting('Maximum interval days', '240');
  const input = await openLearningSetting('Maximum interval days');
  expect(input).toHaveValue(240);
  fireEvent.change(input, { target: { value: '999' } });
  fireEvent.blur(input);
  expect(getCurrentReviewSchedulerSettings().maximumIntervalDays).toBe(240);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await openLearningSetting('Maximum interval days')).toHaveValue(240);
});

it('commits the latest typed value when input and confirmation arrive in the same event batch', async () => {
  render(<CompanionLearningSettingsContent />);
  const input = await openLearningSetting('Reading initial interval days');
  await act(async () => {
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.submit(input.closest('form')!);
  });
  await vi.waitFor(() => expect(getCurrentReviewSchedulerSettings().pushQueue.readingInitialIntervalMs).toBe(172_800_000));
});

it('retains the first precise edit across repeated settings reentry', async () => {
  for (let index = 0; index < 5; index++) {
    const ui = render(<CompanionLearningSettingsContent />);
    await changeSetting('Reading initial interval days', '2');
    await changeSetting('Reading initial interval days', '1');
    ui.unmount();
  }
});

it('opens a focused editor from the setting row and does not persist canceled input', async () => {
  render(<CompanionLearningSettingsContent />);
  fireEvent.click(await screen.findByRole('button', { name: /Maximum interval/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const input = screen.getByRole('spinbutton', { name: 'Maximum interval days' });
  fireEvent.change(input, { target: { value: '180' } });
  fireEvent.blur(input);
  expect(library.database.prepare('SELECT * FROM setting_records').all()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(getCurrentReviewSchedulerSettings().maximumIntervalDays).toBe(36500);
});

it('edits the growth pair together with desktop copy and commits both values atomically after retry', async () => {
  render(<CompanionLearningSettingsContent />);
  const lower = await openLearningSetting('Reading growth factor min');
  const upper = screen.getByRole('spinbutton', { name: 'Reading growth factor max' });
  expect(lower).toHaveValue(1.1);
  expect(upper).toHaveValue(1.5);
  expect(screen.getByRole('dialog')).toHaveTextContent('How quickly the reading interval grows after each pass.');
  fireEvent.change(lower, { target: { value: '1.2' } });
  fireEvent.change(upper, { target: { value: '1.4' } });
  expect(library.database.prepare('SELECT * FROM setting_records').all()).toEqual([]);
  library.database.exec("CREATE TRIGGER reject_pair BEFORE INSERT ON sync_object_state BEGIN SELECT RAISE(ABORT,'full'); END");
  fireEvent.submit(lower.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Changes could not be saved');
  expect(getCurrentReviewSchedulerSettings().pushQueue.readingIntervalGrowthFactorRange).toEqual({ min: 1.1, max: 1.5 });
  expect(library.database.prepare('SELECT * FROM setting_records').all()).toEqual([]);
  expect(lower).toHaveValue(1.2);
  expect(upper).toHaveValue(1.4);
  library.database.exec('DROP TRIGGER reject_pair');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const row = library.database.prepare("SELECT value_json FROM setting_records WHERE key='review_scheduler_settings'").get() as { value_json: string };
  expect(JSON.parse(row.value_json).pushQueue.readingIntervalGrowthFactorRange).toEqual({ min: 1.2, max: 1.4 });
});
