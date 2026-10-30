import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { initialCompanionNavigation } from './companionNavigationState';
import { CompanionTestReviewReset } from './CompanionTestReviewReset';

vi.mock('@capacitor/app', () => ({ App: {
  getInfo: async () => ({ id: 'com.campfirium.foliole.android.acceptance' }),
  addListener: async () => ({ remove: async () => {} })
} }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
afterEach(async () => { cleanup(); await library?.close(); });

it('resets through the real button and restores a review card after reopening from reading-only mode', async () => {
  library = await createResumeLibrary();
  library.database.prepare(`INSERT INTO nodes (id,kind,title,content,reveal,created_at,updated_at)
    VALUES ('card','item','Card','Question','Answer','2026-10-25T00:00:00Z','2026-10-25T00:00:00Z')`).run();
  library.database.prepare("INSERT INTO node_review(node_id,due,state,reps) VALUES ('card','2099-01-01T00:00:00Z',2,1)").run();
  const snapshot = await library.snapshot();
  await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({ ...initialCompanionNavigation(true),
    activeAction: 'more', settingsPage: 'debug', flowSessionMode: 'reading-only' }));
  let savedAtReload: Promise<string | null> | undefined;
  const reload = vi.fn(() => { savedAtReload = loadCompanionNavigationResume(snapshot.libraryScope!); });
  const ui = render(<CompanionNavigationProvider ready snapshot={snapshot} libraryScope={snapshot.libraryScope!}>
    <CompanionTestReviewReset onComplete={reload} />
  </CompanionNavigationProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Reset item reviews' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset item reviews' }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(JSON.parse((await savedAtReload)!)).toMatchObject({ flowSessionMode: 'review-first', activeAction: 'review' });
  await waitFor(async () => expect(JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!))
    .toMatchObject({ flowSessionMode: 'review-first', activeAction: 'review' }));
  expect(library.database.prepare("SELECT * FROM node_review WHERE node_id='card'").all()).toEqual([]);
  ui.unmount();
  const reopened = renderResumeSurface(await library.reopen());
  await waitFor(() => expect(reopened.result.current?.surface.reviewSession.currentCard?.nodeId).toBe('card'));
  expect(reopened.result.current.surface.flowSessionMode).toBe('review-first');
  expect(reopened.result.current.surface.isAnswerRevealed).toBe(false);
  await act(async () => { reopened.unmount(); });
});
