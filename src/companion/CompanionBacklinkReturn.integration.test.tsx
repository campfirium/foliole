// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { saveCompanionNavigationResume } from '../shared/platform/companion/runtime/companionNavigationResume';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { initialCompanionNavigation, type CompanionNavigationState } from './companionNavigationState';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';
import { CompanionRestoredShell } from './CompanionRestoredShell';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';

const android = vi.hoisted(() => ({ back: null as (() => void) | null }));
vi.mock('@capacitor/app', () => ({ App: {
  getState: async () => ({ isActive: true }),
  addListener: async (event: string, listener: () => void) => {
    if (event === 'backButton') android.back = listener;
    return { remove: async () => { if (event === 'backButton') android.back = null; } };
  }
} }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(), stopSyncGroupProvider: async () => {},
      addListener: async () => ({ remove: async () => {} }) }) };
});

type SyncState = Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>>;
let restoreRange: () => void;
beforeAll(() => { restoreRange = installReadingRangeGeometry(); });
afterAll(() => restoreRange());

let library: Awaited<ReturnType<typeof createResumeLibrary>>;

beforeEach(async () => {
  library = await createResumeLibrary();
  library.database.prepare(`INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES ('source', 'folder', 'Source', 'topic', 'See [[Article]] and [[Article]].', '2026-10-25', '2026-10-25')`).run();
});
afterEach(async () => { cleanup(); await library.close(); });

function Shell({ initial }: { initial: SyncState }) {
  const [state, setState] = useState(initial);
  const [, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const loader = useCompanionReadableArticleLoader(state.workspace_snapshot, setReadableArticle);
  const snapshotActions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const workspaceSync = { ...createWorkspaceSync(state.workspace_snapshot), ...loader, ...snapshotActions, state };
  return <MouseGestureSettingsProvider><CompanionNavigationProvider ready snapshot={state.workspace_snapshot}
    libraryScope={state.workspace_snapshot!.libraryScope!}>
    <CompanionRestoredShell bootstrapState={workspaceSync.bootstrapState} workspaceSync={workspaceSync} />
  </CompanionNavigationProvider></MouseGestureSettingsProvider>;
}

function reader() {
  const body = screen.getByTestId('companion-article-document');
  return { body, viewport: body.closest<HTMLElement>('[data-companion-reading-surface]')! };
}

async function followBacklink(source = /Source/, mentions?: string) {
  fireEvent.click(reader().body);
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Backlinks' }));
  const link = await within(screen.getByRole('dialog', { name: 'Backlinks' })).findByRole('button', { name: source });
  if (mentions) expect(link).toHaveTextContent(mentions);
  fireEvent.click(link);
}

function exitArticle(via: 'Exit' | 'Android back') {
  if (via === 'Exit') {
    fireEvent.click(reader().body);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  } else {
    expect(android.back).toBeTypeOf('function');
    act(() => android.back!());
  }
}

async function openShell(navigation: Partial<CompanionNavigationState>) {
  const initial = await loadCompanionWorkspaceSyncState();
  await saveCompanionNavigationResume(initial.workspace_snapshot!.libraryScope!,
    JSON.stringify({ ...initialCompanionNavigation(true), ...navigation }));
  return renderWithLocalization(<Shell initial={initial} />);
}

async function readInFolder() {
  const ui = await openShell({ activeAction: 'recent', isBrowseDirectoryOpen: true,
    directorySelection: { kind: 'internal', nodeId: 'folder' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Open topic Article' }));
  await waitFor(() => expect(reader().body).toHaveTextContent('Read here'));
  return ui;
}

function scrollReader(top: number) {
  const { viewport } = reader();
  fireEvent.touchStart(viewport);
  viewport.scrollTop = top;
  fireEvent.scroll(viewport);
}

async function expectPosition(text: string, top: number) {
  await waitFor(() => {
    expect(reader().body).toHaveTextContent(text);
    expect(reader().viewport.scrollTop).toBe(top);
  });
}

it.each(['Exit', 'Android back'] as const)('returns from a backlink via %s to the prior reading position and then to the directory', async via => {
  await readInFolder();
  scrollReader(925);
  await followBacklink(/Source/, 'Mentioned 2 times');
  await waitFor(() => expect(reader().body).toHaveTextContent('See'));
  expect(library.database.prepare('SELECT scroll_top FROM node_view_state WHERE node_id = ?').pluck().get('article')).toBe(925);

  exitArticle(via);
  await expectPosition('Read here', 925);
  exitArticle(via);
  expect(await screen.findByRole('button', { name: 'Open topic Article' })).toBeVisible();
});

it('returns through multiple backlink sources in order after reopening the library', async () => {
  library.database.prepare(`INSERT INTO nodes (id, parent_id, title, kind, content, created_at, updated_at)
    VALUES ('third', 'folder', 'Third', 'topic', 'Third topic links to [[Source]].', '2026-10-25', '2026-10-25')`).run();
  const ui = await readInFolder();
  scrollReader(925);
  await followBacklink();
  await waitFor(() => expect(reader().body).toHaveTextContent('See'));
  scrollReader(480);
  await followBacklink(/Third/);
  await waitFor(() => expect(reader().body).toHaveTextContent('Third topic'));

  ui.unmount();
  await library.reopen();
  renderWithLocalization(<Shell initial={await loadCompanionWorkspaceSyncState()} />);
  await waitFor(() => expect(reader().body).toHaveTextContent('Third topic'));
  exitArticle('Android back');
  await expectPosition('See', 480);
  exitArticle('Exit');
  await expectPosition('Read here', 925);
  exitArticle('Exit');
  expect(await screen.findByRole('button', { name: 'Open topic Article' })).toBeVisible();
});

it('returns to the position reached after opening a search match and preserves the results', async () => {
  await openShell({ activeAction: 'search' });
  const input = await screen.findByRole('searchbox', { name: 'Search topics' });
  fireEvent.change(input, { target: { value: 'Read here' } });
  fireEvent.click(await screen.findByRole('button', { name: /Article/ }));
  await waitFor(() => expect(reader().body).toHaveTextContent('Read here'));
  scrollReader(925);
  await followBacklink();
  await waitFor(() => expect(reader().body).toHaveTextContent('See'));
  exitArticle('Exit');
  await expectPosition('Read here', 925);
  exitArticle('Exit');
  expect(await screen.findByRole('searchbox', { name: 'Search topics' })).toHaveValue('Read here');
});

it('keeps a backlink cycle in Browse until it returns to the original Flow card and position', async () => {
  library.database.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('Read here and see [[Source]].', 'article');
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'article', reading: {
    intervalDurationMs: 1000, intervalGrowthFactor: 1, lastHandledAt: '2026-01-01T00:00:00Z',
    nextAt: '2026-01-01T00:00:00Z', priority: 5, readingPosition: 0, repetitionCount: 0, state: 'active'
  } });
  await saveCompanionFlowResume((await library.snapshot()).libraryScope!, 'article');
  await openShell({ activeAction: 'review' });
  await waitFor(() => expect(reader().body).toHaveTextContent('Read here'));
  scrollReader(925);
  await followBacklink();
  await waitFor(() => expect(reader().body).toHaveTextContent('See'));
  await followBacklink(/Article/);
  await expectPosition('Read here', 925);
  expect(screen.queryByRole('button', { name: 'Read' })).toBeNull();
  exitArticle('Android back');
  await waitFor(() => expect(reader().body).toHaveTextContent('See'));
  exitArticle('Android back');
  await expectPosition('Read here', 925);
  expect(screen.getByRole('button', { name: 'Read' })).toBeVisible();
});
