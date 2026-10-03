import { act, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSearchExternalArticle } from './CompanionSearchExternalArticle';
import { resolveCompanionSearchSelection } from './companionSearchMatch';
import { createCompanionSearchResultsFixture } from './companionSearchTestFixtures';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';
import { useCompanionSearchNavigation } from './useCompanionSearchNavigation';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

vi.mock('./CompanionReadableArticleDocument', () => ({
  ReadableArticleDocument: (props: { readingSelection: { from: number; to: number } | null; readingRestoreCommandId: string | null }) => (
    <output data-testid="reading-target">{JSON.stringify({ selection: props.readingSelection, command: props.readingRestoreCommandId })}</output>
  )
}));
vi.mock('./CompanionReadableArticleChromeLayer', () => ({ ImmersiveChromeLayer: () => null }));
vi.mock('./CompanionReadableArticleSelectionToolbarLayer', () => ({ SelectionAnnotationToolbarLayer: () => null }));

const body = '# Heading\n\n😀 prefix alpha and alpha';
function article(content = body) {
  return { content, hideTitleHeading: false, nodeId: 'topic-1', persistedNodeViewState: null,
    pdfAttachmentId: null, textAnchorDecorations: [], title: 'Topic' };
}

it('carries a topic match through navigation into the reader restore command', () => {
  const result = { ...createCompanionSearchResultsFixture().topics[0]!, matchStart: 30 };
  const select = vi.fn();
  const surface = { handleSelectBrowseNode: select, selectedBrowseNodeId: 'topic-1', readableArticle: article() } as never;
  const navigation = renderHook(() => useCompanionSearchNavigation(surface));
  act(() => navigation.result.current.openTopic(result, 'alpha'));
  expect(select).toHaveBeenCalledWith('topic-1');
  renderWithLocalization(<CompanionShellReadableArticle onExit={vi.fn()} searchMatch={navigation.result.current.searchMatch}
    surface={surface} workspaceSync={{ state: { workspace_snapshot: null, endpoint_url: null, remembered_targets: [] } } as never} />);
  const from = body.lastIndexOf('alpha');
  expect(JSON.parse(screen.getByTestId('reading-target').textContent!)).toEqual({
    selection: { from, to: from + 5 }, command: 'companion-search-match'
  });
});

it('locates external document body matches and leaves title-only matches without a restore command', () => {
  const document = { ...createCompanionSearchResultsFixture().external[0]!, content: body };
  const searchMatch = { matchStart: 20, query: 'alpha' };
  const view = renderWithLocalization(<CompanionSearchExternalArticle document={document} onExit={vi.fn()} searchMatch={searchMatch} />);
  expect(JSON.parse(screen.getByTestId('reading-target').textContent!).selection).toEqual({ from: body.indexOf('alpha'), to: body.indexOf('alpha') + 5 });
  view.rerender(<CompanionSearchExternalArticle document={document} onExit={vi.fn()} searchMatch={{ matchStart: 0, query: 'title-only' }} />);
  expect(JSON.parse(screen.getByTestId('reading-target').textContent!)).toEqual({ selection: null, command: null });
});

it('uses an available body after loading and lets subsequent outline navigation take precedence', () => {
  const match = { matchStart: 20, query: 'alpha' };
  const hook = renderHook(({ content }) => useImmersiveReadableArticleState(resolveCompanionSearchSelection(content, match)), {
    initialProps: { content: '' }
  });
  expect(hook.result.current.readingSelection).toBeNull();
  hook.rerender({ content: body });
  expect(hook.result.current.readingSelection?.from).toBe(body.indexOf('alpha'));
  act(() => hook.result.current.handleSelectOutlineItem({ from: 2, to: 9 }));
  expect(hook.result.current.readingSelection).toEqual({ from: 2, to: 9 });
});
