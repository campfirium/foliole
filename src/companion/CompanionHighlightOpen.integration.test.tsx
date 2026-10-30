// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';

let library: Awaited<ReturnType<typeof createResumeLibrary>>;
let highlightId: string;
let snapshot: WorkspaceSnapshot;
beforeEach(async () => {
  library = await createResumeLibrary();
  snapshot = await library.snapshot();
});

async function prepareAnnotation(kind: 'highlight' | 'cloze') {
  const saved = await persistCompanionSelectionAnnotation({ deviceId: 'fixture', kind,
    snapshot: await library.snapshot(), payload: {
      parentNodeId: 'article', anchorId: 'read-anchor', selectionText: 'Read here', clozeContent: '# Article\n\n[...]',
      entries: [{ locator: { from: 11, to: 20, originalText: 'Read here' } }]
    } });
  highlightId = saved!.nodeId;
  snapshot = await library.snapshot();
  // jsdom has no layout; only supply the hit-test position for the real editor.
  vi.spyOn(EditorView.prototype, 'posAtCoords').mockReturnValue(13);
  await saveCompanionFlowResume(snapshot.libraryScope!, false, 'article');
}
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await library.close(); });

function Reader({ browse }: { browse: boolean }) {
  const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const loader = useCompanionReadableArticleLoader(snapshot, setReadableArticle);
  const workspaceSync = { ...createWorkspaceSync(snapshot), ...loader, readableArticle };
  const surface = useCompanionArticleSurface(workspaceSync, createFloatingBar());
  return <>
    <button onClick={() => { surface.handleTabAction('recent'); surface.handleSelectBrowseNode('article'); }}>Browse source</button>
    <output data-testid="opened-topic">{surface.readableArticle?.nodeId}</output>
    <CompanionShellReadableArticle flow={!browse && !surface.isFlowBrowsing} surface={surface} workspaceSync={workspaceSync}
      onExit={surface.handleExitBrowseArticle} />
  </>;
}

it.each([
  { browse: false, kind: 'highlight' as const }, { browse: true, kind: 'highlight' as const },
  { browse: false, kind: 'cloze' as const }, { browse: true, kind: 'cloze' as const }
])('opens the real annotation from $kind / browse=$browse without grading it', async ({ browse, kind }) => {
  await prepareAnnotation(kind);
  const facts = () => ({
    reading: library.database.prepare('SELECT * FROM node_reading ORDER BY node_id').all(),
    review: library.database.prepare('SELECT * FROM node_review ORDER BY node_id').all()
  });
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <CompanionNavigationProvider ready snapshot={snapshot} libraryScope={snapshot.libraryScope!}>
      <Reader browse={browse} />
    </CompanionNavigationProvider>
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  await waitFor(() => expect(screen.getByTestId('opened-topic')).toHaveTextContent('article'));
  if (browse) fireEvent.click(screen.getByRole('button', { name: 'Browse source' }));
  const before = facts();
  const highlightedText = await waitFor(() => {
    const element = document.querySelector<HTMLElement>(kind === 'cloze' ? '.cm-md-cloze' : '.cm-md-highlight');
    expect(element).not.toBeNull();
    return element!;
  });
  fireEvent.pointerDown(highlightedText, { pointerType: 'touch' });
  fireEvent.pointerUp(highlightedText, { pointerType: 'touch' });
  fireEvent.click(highlightedText);
  const open = await screen.findByRole('button', { name: 'Open' });
  await waitFor(() => expect(open).toBeEnabled());
  if (kind === 'highlight') expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled();
  expect(screen.getByRole('button', { name: kind === 'cloze' ? 'Delete cloze' : 'Close Highlight' })).toBeEnabled();
  fireEvent.click(open);
  await waitFor(() => expect(screen.getByTestId('opened-topic')).toHaveTextContent(highlightId));
  expect(screen.queryByRole('toolbar')).toBeNull();
  expect(document.querySelector('.cm-content')).toHaveTextContent(kind === 'cloze' ? '[...]' : 'Read here');
  expect(facts()).toEqual(before);
  fireEvent.click(document.querySelector('.cm-line')!, { detail: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  await waitFor(() => expect(screen.getByTestId('opened-topic')).not.toHaveTextContent(highlightId));
  expect(facts()).toEqual(before);
});
