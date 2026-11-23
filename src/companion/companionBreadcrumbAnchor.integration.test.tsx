// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncObjects';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionNavigationProvider } from './CompanionNavigationProvider';
import { installReadingRangeGeometry } from './companionReadingPages.testSupport';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});

const passage = 'This is the original passage.';
const parentBody = '# Article\n\n' + 'Earlier text.\n\n'.repeat(24) + passage;
const targetOffset = parentBody.indexOf(passage);
let library: Awaited<ReturnType<typeof createResumeLibrary>>;

let restoreGeometry: () => void;

beforeEach(async () => {
  restoreGeometry = installReadingRangeGeometry();
  library = await createResumeLibrary();
});

afterEach(async () => {
  cleanup();
  restoreGeometry();
  await library.close();
});

function Reader({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [, setArticle] = useState<CompanionReadableArticle | null>(null);
  const loader = useCompanionReadableArticleLoader(snapshot, setArticle);
  const workspaceSync = { ...createWorkspaceSync(snapshot), ...loader };
  const surface = useCompanionArticleSurface(workspaceSync, createFloatingBar());
  return <>
    <button onClick={() => surface.handleSelectRecentArticle('child')}>Open child</button>
    <button onClick={() => surface.handleSelectRecentArticle('article')}>Open parent</button>
    <CompanionShellReadableArticle onExit={surface.handleExitBrowseArticle}
      surface={surface} workspaceSync={workspaceSync} />
  </>;
}

async function openReader(kind: 'highlight' | 'cloze', originalText = passage) {
  library.database.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(parentBody, 'article');
  const anchor = { id: 'source-anchor', kind, locator: { from: 11, to: 11 + originalText.length, originalText } };
  library.database.prepare(`INSERT INTO nodes (id, parent_id, title, kind, content, anchor_link, created_at, updated_at)
    VALUES ('child', 'article', 'Derived material', ?, 'Child content', ?, '2026-01-01', '2026-01-01')`)
    .run(kind === 'cloze' ? 'item' : 'topic', JSON.stringify(anchor));
  await saveCompanionSyncNodeViewState({ nodeId: 'article', scrollTop: 300 });
  const snapshot = await library.snapshot();
  const { container } = renderWithLocalization(
    <MouseGestureSettingsProvider><CompanionDraftProvider>
      <CompanionNavigationProvider ready snapshot={snapshot} libraryScope={snapshot.libraryScope!}>
        <Reader snapshot={snapshot} />
      </CompanionNavigationProvider>
    </CompanionDraftProvider></MouseGestureSettingsProvider>
  );
  const editor = () => {
    const element = container.querySelector<HTMLElement>('.cm-editor');
    return element ? EditorView.findFromDOM(element) : null;
  };
  fireEvent.click(await screen.findByRole('button', { name: 'Open child' }));
  await waitFor(() => expect(editor()?.state.doc.toString()).toBe('Child content'));
  const breadcrumb = screen.getByRole('navigation', { name: 'Review breadcrumb' });
  fireEvent.click(within(breadcrumb).getByRole('button', { name: 'Article' }));
  await waitFor(() => expect(editor()?.state.doc.toString()).toBe(parentBody));
  return editor;
}

it.each(['highlight', 'cloze'] as const)('jumps from a %s to its relocated source text through the parent breadcrumb', async kind => {
  const editor = await openReader(kind);
  await waitFor(() => expect(editor()?.state.selection.main.head).toBe(targetOffset));

  fireEvent.click(screen.getByRole('button', { name: 'Open child' }));
  await waitFor(() => expect(editor()?.state.doc.toString()).toBe('Child content'));
  fireEvent.click(screen.getByRole('button', { name: 'Open parent' }));
  await waitFor(() => expect(editor()?.state.doc.toString()).toBe(parentBody));
  expect(editor()?.state.selection.main.head).toBe(0);
});

it('opens the parent at its saved reading position when the passage no longer resolves', async () => {
  const editor = await openReader('highlight', 'Passage no longer in the parent');
  expect(editor()?.dom.closest('[data-companion-reading-surface]')?.scrollTop).toBe(300);
  expect(editor()?.state.selection.main.head).toBe(0);
});
