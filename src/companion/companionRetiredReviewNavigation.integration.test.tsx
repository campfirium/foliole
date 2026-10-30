import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadCompanionNavigationResume, saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { createResumeLibrary, renderResumeSurface } from '../test/companionNavigationResume.testSupport';

import { initialCompanionNavigation } from './companionNavigationState';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
beforeEach(async () => { library = await createResumeLibrary(); });
afterEach(async () => { cleanup(); await library.close(); });

it.each(['recommended', 'review-first', 'reading-only'] as const)(
  'reopens the current %s Flow mode while discarding the retired Only Review navigation flag', async mode => {
    const snapshot = await library.snapshot();
    await saveCompanionNavigationResume(snapshot.libraryScope!, JSON.stringify({
      ...initialCompanionNavigation(true), isOnlyReviewOpen: true, flowSessionMode: mode
    }));
    const ui = renderResumeSurface(await library.reopen());
    await waitFor(() => expect(ui.result.current?.surface.flowReady).toBe(true));
    expect(ui.result.current.surface.activeAction).toBe('review');
    expect(ui.result.current.surface.flowSessionMode).toBe(mode);
    expect(ui.result.current.actions.topBarProps.title).toBe('Flow');
    await waitFor(async () => {
      const saved = JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!);
      expect(saved).not.toHaveProperty('isOnlyReviewOpen');
      expect(saved.flowSessionMode).toBe(mode);
    });
    expect(library.database.prepare('SELECT COUNT(*) AS n FROM review_log').get()).toEqual({ n: 0 });
    expect(library.database.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
  }
);
