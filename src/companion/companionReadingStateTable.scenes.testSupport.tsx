// Scenes of the reading state table: each mounts real reading components for one starting situation.
import { render } from '@testing-library/react';
import type { ComponentProps, ReactElement } from 'react';
import { vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { createBreadcrumbSnapshot, createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

type ArticleProps = ComponentProps<typeof ImmersiveReadableArticle>;
type ShellProps = ComponentProps<typeof CompanionShellReadableArticle>;

export function mount(element: ReactElement) {
  const wrap = (next: ReactElement) => <LocalizationProvider>{next}</LocalizationProvider>;
  const view = render(wrap(element));
  return { rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}

const readable = (nodeId: string, content = 'Reading body') => ({ content, hideTitleHeading: false, nodeId,
  persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [], title: nodeId });

export function article(overrides: Partial<ArticleProps> = {}, nodeId = 'topic-1') {
  return <ImmersiveReadableArticle key={nodeId} onExit={() => undefined} snapshot={null}
    readableArticle={readable(nodeId)} {...overrides} />;
}

export function editableArticle(overrides: Partial<ArticleProps> = {}) {
  return article({ onSaveArticleContent: createContentSaveMock({ content: 'Reading body', versionId: 'initial' }), ...overrides });
}

export function answeredItem() {
  return article({ isReviewItem: true, answer: 'Stored answer',
    onSaveArticleContent: createContentSaveMock({ content: 'Reading body', reveal: 'Stored answer', versionId: 'initial' }) });
}

/** A topic that already has one highlight, so a tap on it opens the menu without any text selection. */
export function highlightedArticle() {
  const snapshot = createBreadcrumbSnapshot();
  const parent = snapshot.nodesById['topic-1']!;
  parent.content = 'Reading body';
  snapshot.nodesById['highlight-1'] = { ...parent, id: 'highlight-1', parentNodeId: 'topic-1', content: 'Reading', title: 'Reading',
    anchorLink: { id: 'anchor-1', kind: 'highlight', locator: { from: 0, to: 7, originalText: 'Reading' } } } as
    WorkspaceSnapshot['nodesById'][string];
  snapshot.nodeOrder.push('highlight-1');
  return article({ snapshot, onCreateSelectionAnnotation: () => null });
}

export function annotatableArticle() {
  return article({ snapshot: createBreadcrumbSnapshot(), onCreateSelectionAnnotation: () => null });
}

export interface ShellScene {
  nodeId: string;
  loading?: boolean;
  flow?: boolean;
  revealed?: boolean;
  browsing?: boolean;
}

/** The reader as the companion shell composes it, including its loading placeholder and review footer. */
export function shell(scene: ShellScene) {
  const snapshot = createBreadcrumbSnapshot();
  const base = createItemReviewSurface();
  const isItem = snapshot.nodesById[scene.nodeId]?.kind === 'item';
  const surface = {
    ...base,
    isFlowBrowsing: scene.browsing === true,
    isAnswerRevealed: scene.revealed === true,
    selectedBrowseNodeId: scene.browsing ? scene.nodeId : null,
    readableArticle: scene.loading ? null : readable(scene.nodeId),
    effectiveReviewSession: { ...base.effectiveReviewSession, currentCard: { ...base.effectiveReviewSession.currentCard,
      nodeId: scene.nodeId, itemKind: isItem ? 'fsrs' : 'reading', reveal: isItem ? 'Review answer' : null, hasAnswer: isItem } }
  } as unknown as ShellProps['surface'];
  return <CompanionShellReadableArticle flow={scene.flow ?? true} onExit={vi.fn()} surface={surface}
    workspaceSync={{ state: { workspace_snapshot: snapshot, remembered_targets: [] },
      refreshAfterMutation: vi.fn() } as unknown as ShellProps['workspaceSync']} />;
}
