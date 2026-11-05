import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { REVIEW_TRAINING_ENGINE, type ReviewTrainingModel } from '../../lib/core/review/trainingModel';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { loadCompanionReviewTrainingPlan, saveCompanionReviewTrainingModel } from '../shared/platform/companion/runtime/companionReviewTraining';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { readIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { closeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

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
  library.database.exec(`INSERT INTO nodes(id,kind,title,created_at,updated_at)
    VALUES ('english','folder','English reading','now','now')`);
});
afterEach(async () => { await library.close(); });

function SettingsEntry() {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  return <LocalizationProvider initialLanguagePreference="en">{renderCompanionSettingsContent({ settingsPage,
    onBackToSettingsList: () => setSettingsPage('list'), onOpenSyncSettings: () => setSettingsPage('sync'),
    onOpenSyncSettingsPage: setSettingsPage, workspaceSync: {} as never })}</LocalizationProvider>;
}

async function openLearning() {
  fireEvent.click(await screen.findByRole('button', { name: 'Review', exact: true }));
  await screen.findByRole('heading', { name: 'Automatic review optimization' });
}

async function saveModel() {
  const plan = await loadCompanionReviewTrainingPlan();
  const model: ReviewTrainingModel = { folderId: 'english', weights: Array.from({ length: 21 }, () => 1),
    enabled: false, reviewCount: 1024, trainedAt: '2026-10-01T08:00:00.000Z',
    engine: REVIEW_TRAINING_ENGINE, candidate: null, baseline: null };
  await saveCompanionReviewTrainingModel(model, plan.libraryScope);
}

it('opens Review with the desktop Scheduler structure and keeps its related settings together', async () => {
  render(<SettingsEntry />);
  expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Learning settings' })).not.toBeInTheDocument();
  await openLearning();
  const scheduler = within(screen.getByRole('region', { name: 'Review settings section' }));
  expect(scheduler.getByRole('heading', { name: 'Scheduler' })).toBeInTheDocument();
  expect(scheduler.getByRole('heading', { name: 'Automatic review optimization' })).toBeInTheDocument();
  expect(scheduler.queryByRole('group', { name: 'Review schedule' })).not.toBeInTheDocument();
  expect(scheduler.queryByRole('group', { name: 'Topic priority' })).not.toBeInTheDocument();
  expect(scheduler.queryByRole('group', { name: 'Reading intervals' })).not.toBeInTheDocument();
  const day = scheduler.getByRole('button', { name: /^New day starts at/ });
  const balance = scheduler.getByRole('button', { name: /^New item load balancing/ });
  expect(day.compareDocumentPosition(balance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const mix = scheduler.getByRole('button', { name: /^Reading vs review mix/ });
  const priority = scheduler.getByRole('button', { name: /^Priority weight/ });
  expect(mix.compareDocumentPosition(priority) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(await scheduler.findByText('None yet')).toBeInTheDocument();
});

it('opens real history, observes a committed model in the same view, and restores it after reentry and database reopening', async () => {
  const ui = render(<SettingsEntry />);
  await openLearning();
  expect(await screen.findByText('None yet')).toBeInTheDocument();
  const before = library.database.prepare('SELECT * FROM setting_records').all();
  expect(before).toEqual([]);
  await act(saveModel);
  expect(await screen.findByText('English reading')).toBeInTheDocument();
  const [record] = library.database.prepare("SELECT value_json FROM setting_records WHERE key LIKE 'review_training/%'").all() as { value_json: string }[];
  const time = JSON.parse(record!.value_json).trainedAt as string;
  const formatted = new Date(time).toLocaleString('en', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
  expect(screen.getByText(formatted)).toHaveAttribute('dateTime', time);
  ui.unmount();
  const again = render(<SettingsEntry />);
  await openLearning();
  expect(await screen.findByText(formatted)).toHaveAttribute('dateTime', time);
  again.unmount();
  const reopened = await reopenSearchLibrary(library.root, '2026-11-05T09:00:00Z');
  try {
    const restored = render(<SettingsEntry />);
    await openLearning();
    expect(await screen.findByText('English reading')).toBeInTheDocument();
    expect(screen.getByText(formatted)).toHaveAttribute('dateTime', time);
    expect(reopened.db.prepare("SELECT value_json FROM setting_records WHERE key LIKE 'review_training/%'").get()).toEqual(record);
    restored.unmount();
  } finally { await closeIosCompanionDatabase(); }
});

it('distinguishes corrupt history from no history and retries without changing the persisted record', async () => {
  await saveModel();
  const record = library.database.prepare("SELECT value_json FROM setting_records WHERE key LIKE 'review_training/%'").get() as { value_json: string };
  library.database.exec("UPDATE setting_records SET value_json='bad' WHERE key LIKE 'review_training/%'");
  render(<SettingsEntry />);
  await openLearning();
  expect(await screen.findByRole('alert')).toHaveTextContent('Training history could not be loaded.');
  expect(screen.queryByText('None yet')).not.toBeInTheDocument();
  expect(library.database.prepare("SELECT value_json FROM setting_records WHERE key LIKE 'review_training/%'").get()).toEqual({ value_json: 'bad' });
  library.database.prepare("UPDATE setting_records SET value_json=? WHERE key LIKE 'review_training/%'").run(record.value_json);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('English reading')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('retains the timestamp with an unavailable folder instead of pretending history is empty', async () => {
  await saveModel();
  library.database.exec("UPDATE nodes SET deleted_at='now' WHERE id='english'");
  render(<SettingsEntry />);
  await openLearning();
  expect(await screen.findByText('Unavailable folder')).toBeInTheDocument();
  expect(screen.queryByText('None yet')).not.toBeInTheDocument();
});

it('reports a database read failure and recovers on retry', async () => {
  const query = vi.spyOn(library.readonlyQueries, 'query');
  query.mockImplementation((sql, values) => {
    if (sql.includes("key LIKE 'review_training/%'")) throw new Error('unreadable');
    return library.base.query(sql, values);
  });
  render(<SettingsEntry />);
  await openLearning();
  expect(await screen.findByRole('alert')).toHaveTextContent('Training history could not be loaded.');
  query.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('None yet')).toBeInTheDocument();
  expect(await readIosCompanionDatabase(db => db.query('SELECT * FROM setting_records'))).toEqual([]);
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
