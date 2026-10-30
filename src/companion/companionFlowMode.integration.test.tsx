import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeEach(async () => {
  library = await createResumeLibrary();
  library.database.prepare('INSERT INTO nodes (id, title, kind, content, reveal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('card', 'Card', 'item', 'Question', 'Answer', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');
});
afterEach(async () => { cleanup(); await library.close(); });

it('switches real persisted Flow between all modes without recording learning and restores the selection after reopen', async () => {
  const snapshot = await library.snapshot();
  const ui = renderResumeSurface(snapshot);
  await waitFor(() => expect(ui.result.current?.surface.flowReady).toBe(true));
  expect(ui.result.current.surface.flowSessionMode).toBe('recommended');
  act(() => ui.result.current.surface.setFlowSessionMode('reading-only'));
  await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  await waitFor(() => expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe('article'));
  expect(library.database.prepare('SELECT mode FROM daily_flow_state').get()).toEqual({ mode: 'reading-only' });
  act(() => ui.result.current.surface.setFlowSessionMode('review-first'));
  await waitFor(() => expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe('card'));
  expect(library.database.prepare('SELECT mode FROM daily_flow_state').get()).toEqual({ mode: 'review-first' });
  await waitFor(async () => expect(JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!).flowSessionMode).toBe('review-first'));
  ui.unmount();
  const reopened = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(reopened.result.current?.surface.flowReady).toBe(true));
  expect(reopened.result.current.surface.flowSessionMode).toBe('review-first');
  expect(reopened.result.current.surface.reviewSession.currentCard?.nodeId).toBe('card');
  act(() => reopened.result.current.surface.setFlowSessionMode('recommended'));
  await waitFor(() => expect(reopened.result.current.surface.flowReady).toBe(true));
  expect(library.database.prepare('SELECT mode FROM daily_flow_state').get()).toEqual({ mode: 'recommended' });
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log').get()).toEqual({ n: 0 });
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
});

it('can leave an empty mode without completing or discarding its hidden review cards', async () => {
  library.database.prepare("DELETE FROM nodes WHERE id = 'article'").run();
  const ui = renderResumeSurface(await library.snapshot());
  await waitFor(() => expect(ui.result.current?.surface.flowReady).toBe(true));
  await waitFor(() => expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe('card'));
  act(() => ui.result.current.surface.setFlowSessionMode('reading-only'));
  await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
  expect(ui.result.current.surface.reviewSession.currentCard).toBeNull();
  expect(ui.result.current.surface.flowSessionMode).toBe('reading-only');
  act(() => ui.result.current.surface.setFlowSessionMode('review-first'));
  await waitFor(() => expect(ui.result.current.surface.reviewSession.currentCard?.nodeId).toBe('card'));
  expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log').get()).toEqual({ n: 0 });
});
