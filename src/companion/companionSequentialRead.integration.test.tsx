import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { loadCompanionDailySession } from '../shared/platform/companion/runtime/companionDailyFlow';
import { saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { saveIosReadingWithDb } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites';
import { toReadingPayload } from '../shared/platform/companionSyncStateWriters';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { useDailyFlowSurface } from './companionFlowDay.testSupport';
import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-26T08:00:00.000Z';
const first = '000000';
const nextChapter = '000001';
const alreadyQueued = '000002';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  library = await createSearchLibrary(3, 4000);
  library.database.prepare('UPDATE nodes SET created_at=?,updated_at=?').run(now, now);
  library.database.prepare("INSERT INTO nodes (id,title,kind,sequential_reading_enabled,created_at,updated_at) VALUES ('book','Book','folder',1,?,?)").run(now, now);
  library.database.prepare("UPDATE nodes SET parent_id='book' WHERE id IN (?,?)").run(first, nextChapter);
  const locked = { state: 'locked' as const, priority: 9, readingPosition: 0, repetitionCount: 0,
    intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now };
  await writeIosCompanionDatabase(db => saveIosReadingWithDb(db, {
    node_id: nextChapter, reading_json: JSON.stringify(toReadingPayload(locked))
  }));
});

afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await library.close(); });

function Reader({ initial }: { initial: WorkspaceSnapshot }) {
  const { surface, workspace } = useDailyFlowSurface(initial);
  return <CompanionShellReadableArticle flow surface={surface} workspaceSync={workspace} onExit={() => {}} />;
}

function supplyArticleGeometry(nodeId: string, bottom: number) {
  // jsdom does not lay out the document. Supply only the two boxes used at click time.
  const body = screen.getByTestId('companion-article-document');
  expect(body).toHaveAttribute('data-node-id', nodeId);
  const surface = body.closest<HTMLElement>('[data-companion-reading-surface]')!;
  Object.defineProperty(surface, 'clientHeight', { configurable: true, value: 500 });
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 1500 });
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, bottom - 1500, 400, 600));
}

async function expectTopic(nodeId: string) {
  await waitFor(() => expect(screen.getByTestId('companion-article-document')).toHaveAttribute('data-node-id', nodeId));
}

it.each([
  { action: 'Read', bottom: 1100, state: 'locked', queued: true },
  { action: 'Read', bottom: 600, state: 'active', queued: true },
  { action: 'Read', bottom: 600, state: 'active', queued: false },
  { action: 'Read', bottom: 600, state: 'active', queued: false, retry: true },
  { action: 'Dismiss', bottom: 1100, state: 'active', queued: true }
])('$action at body bottom $bottom persists $state with existing work=$queued (retry=$retry)', async ({ action, bottom, state, queued, retry }) => {
  if (!queued) library.database.prepare('UPDATE nodes SET shelved_at=? WHERE id=?').run(now, alreadyQueued);
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  await saveCompanionFlowResume(initial.libraryScope!, first);
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <CompanionNavigationProvider ready snapshot={initial} libraryScope={initial.libraryScope!}>
      <Reader initial={initial} />
    </CompanionNavigationProvider>
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const engine = await getCompanionReadIntents();
  await expectTopic(first);
  supplyArticleGeometry(first, bottom);
  if (retry) library.database.exec("CREATE TRIGGER reject_read BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  fireEvent.click(screen.getByRole('button', { name: action }));
  if (retry) {
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('disk full'));
    expect(library.database.prepare('SELECT state FROM node_reading WHERE node_id=?').get(nextChapter)).toEqual({ state: 'locked' });
    expect((await loadCompanionDailySession())?.currentNodeId).toBe(first);
    library.database.exec('DROP TRIGGER reject_read');
    supplyArticleGeometry(first, 1100);
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  }
  const expectedNext = queued ? alreadyQueued : nextChapter;
  await expectTopic(expectedNext);
  await act(async () => { await engine.drain(); });

  const reading = (id: string) => library.database.prepare('SELECT state,repetition_count FROM node_reading WHERE node_id=?').get(id);
  expect(reading(first)).toMatchObject(action === 'Read' ? { repetition_count: 1 } : { state: 'dismissed' });
  expect(reading(nextChapter)).toEqual({ state, repetition_count: 0 });
  expect((await loadCompanionDailySession())?.currentNodeId).toBe(expectedNext);
  expect(await engine.journal.rows(false)).toHaveLength(action === 'Read' ? 1 : 0);
  if (queued) {
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    if (state === 'active') await expectTopic(nextChapter);
    await waitFor(async () => expect((await loadCompanionDailySession())?.currentNodeId).toBe(state === 'active' ? nextChapter : null));
  }
});
