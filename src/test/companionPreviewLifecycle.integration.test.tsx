// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

import { CompanionNavigationProvider, useCompanionNavigationField } from '../companion/CompanionNavigationProvider';
import { CompanionPreviewLifecycle } from '../companion/CompanionPreviewLifecycle';
import { CompanionReadingActivity } from '../companion/companionReadingActivity';
import { useCompanionViewStateSync } from '../companion/useCompanionViewStateSync';
import { loadCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';

import { createResumeLibrary } from './companionNavigationResume.testSupport';

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
afterEach(async () => { delete window.__foliolePreviewUnmount; cleanup(); await library?.close(); });

it('flushes pending reading, navigation and draft work before shutting down the product owner', async () => {
  library = await createResumeLibrary();
  const snapshot = await library.snapshot();
  const activity = new CompanionReadingActivity('article', () => {});
  activity.flushDraft = () => writeIosCompanionDatabase(db => db.run('UPDATE nodes SET title = ? WHERE id = ?', ['Saved draft', 'article']).then(() => undefined));
  function Surface() {
    const [, setAction] = useCompanionNavigationField('activeAction', 'review');
    const scroll = useCompanionViewStateSync({ activeAction: 'recent', selectedBrowseNodeId: 'article',
      readableArticleNodeId: 'article', reviewNodeId: null });
    return <><CompanionPreviewLifecycle activity={activity} destination="recent" ready />
      <button onClick={() => { setAction('recent'); scroll(731); }}>Read</button></>;
  }
  const view = render(<CompanionNavigationProvider ready snapshot={snapshot} libraryScope={snapshot.libraryScope!}>
    <Surface />
  </CompanionNavigationProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Read' })).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  window.__foliolePreviewUnmount = view.unmount;
  const close = window.__foliolePreviewFlush!;
  await act(() => close());
  cleanup();
  await library.reopen();
  expect(JSON.parse((await loadCompanionNavigationResume(snapshot.libraryScope!))!).activeAction).toBe('recent');
  expect(library.database.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('article')).toBe(731);
  expect(library.database.prepare('SELECT title FROM nodes WHERE id = ?').pluck().get('article')).toBe('Saved draft');
});
