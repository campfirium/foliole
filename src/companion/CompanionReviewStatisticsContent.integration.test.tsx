import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { loadCompanionReviewCalendar } from '../shared/platform/companion/runtime/companionReviewCalendar';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { saveIosReading, saveIosReview } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites';

import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 12));
  library = await createSearchLibrary(0);
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});
afterEach(async () => { cleanup(); await library.close(); vi.useRealTimers(); });

function SettingsEntry() {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  return renderCompanionSettingsContent({ settingsPage, onBackToSettingsList: () => setSettingsPage('list'),
    onOpenSyncSettings: () => setSettingsPage('sync'), onOpenSyncSettingsPage: setSettingsPage,
    workspaceSync: { state: { workspace_snapshot: { libraryScope: 'Search' } } } as never });
}

it('opens persisted mobile review facts from settings and retains distinct counts after reopening the database', async () => {
  const insert = library.database.prepare(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES (?,?,'Question','Original','2026-11-01T08:00:00Z','2026-11-01T08:00:00Z')`);
  insert.run('item', 'item'); insert.run('topic', 'topic');
  for (const opId of ['first', 'second']) {
    await saveIosReview({ node_id: 'item', review_json: '{}', review_log_json: JSON.stringify({
      opId, grade: 3, reviewedAt: '2026-11-03T08:00:00Z', schedulerVersion: 'test' }) });
    await saveIosReading({ node_id: 'topic', completedReviewDay: '2026-11-03', reading_json: JSON.stringify({
      intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: '2026-11-03T08:00:00Z',
      nextAt: '2026-11-04T08:00:00Z', priority: 0, repetitionCount: 1, readingPosition: 0, state: 'active'
    }) });
  }
  const ui = render(<SettingsEntry />);
  fireEvent.click(screen.getByRole('button', { name: 'Review statistics' }));
  await waitFor(() => expect(screen.getByRole('group', { name: /^2026-11-03 / })).toHaveAccessibleName(/Topic: 1 · Item: 1/));
  expect(screen.getByRole('group', { name: /^2026-11-04 / })).toHaveAccessibleName(/Topic: 1/);
  ui.unmount();
  await reopenSearchLibrary(library.root, '2026-11-04T09:00:00Z');
  render(<SettingsEntry />);
  fireEvent.click(screen.getByRole('button', { name: 'Review statistics' }));
  await waitFor(() => expect(screen.getByRole('group', { name: /^2026-11-03 / })).toHaveAccessibleName(/Topic: 1 · Item: 1/));
  await expect(loadCompanionReviewCalendar({ libraryScope: 'other-library',
    from: '2026-11-01T00:00:00Z', to: '2026-12-01T00:00:00Z', now: new Date().toISOString()
  })).rejects.toThrow('calendar_library_changed');
});

it('reads an initialized empty mobile library without inventing history or requiring a workspace snapshot', async () => {
  const result = await loadCompanionReviewCalendar({ libraryScope: '',
    from: '2026-11-01T00:00:00Z', to: '2026-12-01T00:00:00Z', now: new Date().toISOString() });
  expect(result.days).toEqual([]);
  expect(result.scheduledDays).toEqual([]);
  expect(result.topicCoverageFrom).toBeTruthy();
});
