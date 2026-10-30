import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { loadPreparedCompanionArticle } from '../shared/platform/companion/reading/companionArticlePreparation';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <article>{props.value}</article>
}));

type Props = ComponentProps<typeof CompanionShellReadableArticle>;
let library: Awaited<ReturnType<typeof createSearchLibrary>> | undefined;
afterEach(async () => { await library?.close(); library = undefined; });

async function readingProps(): Promise<Props> {
  const state = await loadCompanionWorkspaceSyncState();
  const snapshot = state.workspace_snapshot!;
  expect(snapshot.nodesById['000000']!.reveal).toBeNull();
  const article = await loadPreparedCompanionArticle(snapshot, '000000', () => true);
  expect(article?.reveal).toBe('Persisted answer');
  return {
    onExit: vi.fn(),
    surface: { ...createItemReviewSurface(), readableArticle: article, isFlowBrowsing: false } as unknown as Props['surface'],
    workspaceSync: { state, refreshAfterMutation: vi.fn() } as unknown as Props['workspaceSync']
  };
}

it('shows a persisted Item answer loaded separately from its catalog, including after database reopen', async () => {
  library = await createSearchLibrary(1, 64);
  library.database.prepare('UPDATE nodes SET kind=?, content=?, reveal=? WHERE id=?')
    .run('item', 'Persisted question', 'Persisted answer', '000000');
  const props = await readingProps();
  const view = renderWithLocalization(<CompanionShellReadableArticle {...props} />);
  expect(screen.getByText('Persisted question')).toBeInTheDocument();
  expect(screen.getByText('Persisted answer')).toBeInTheDocument();
  view.unmount();

  await reopenSearchLibrary(library.root, '2026-10-30T10:30:00Z');
  const reopened = await readingProps();
  renderWithLocalization(<CompanionShellReadableArticle {...reopened} />);
  expect(screen.getByText('Persisted question')).toBeInTheDocument();
  expect(screen.getByText('Persisted answer')).toBeInTheDocument();
});
