import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  articleDocumentProps: vi.fn(),
  immersiveArticleProps: vi.fn(),
  supportsNodeWrite: true
}));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  supportsCompanionNodeMutation: () => testState.supportsNodeWrite
}));
vi.mock('./CompanionReadableArticleDocument', () => ({
  ReadableArticleDocument: (props: Record<string, unknown>) => {
    testState.articleDocumentProps(props);
    return null;
  }
}));
vi.mock('./CompanionReadableArticleSurface', () => ({
  ImmersiveReadableArticle: (props: Record<string, unknown>) => {
    testState.immersiveArticleProps(props);
    return null;
  }
}));
vi.mock('./companionWorkspaceSyncEndpoint', () => ({
  resolveCompanionWorkspaceSyncEndpoint: () => null
}));

import { ReadableArticleOrFallback } from './CompanionReadableArticleFallback';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

const readableArticle = { nodeId: 'topic-1', title: 'Topic' };
const surface = {
  handleViewScroll: vi.fn(),
  readableArticle
} as never;
const workspaceSync = {
  state: { workspace_snapshot: null },
  status: 'idle'
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  testState.supportsNodeWrite = true;
});

it('omits all immersive node mutation handlers when the host cannot persist node versions', () => {
  testState.supportsNodeWrite = false;

  render(<CompanionShellReadableArticle onExit={vi.fn()} surface={surface} workspaceSync={workspaceSync} />);

  const props = testState.immersiveArticleProps.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(props.onAddExistingHighlightNote).toBeUndefined();
  expect(props.onCreateSelectionAnnotation).toBeUndefined();
  expect(props.onDeleteExistingHighlight).toBeUndefined();
  expect(props.onRestoreFromTrash).toBeUndefined();
  expect(props.onSaveArticleContent).toBeUndefined();
});

it('keeps the non-immersive article read-only when the host cannot persist node versions', () => {
  testState.supportsNodeWrite = false;

  render(
    <ReadableArticleOrFallback
      error={null}
      hasSnapshot
      onAttachmentResourceSynced={vi.fn()}
      surface={surface}
      workspaceSync={workspaceSync}
    />
  );

  const props = testState.articleDocumentProps.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(props.onSaveContent).toBeUndefined();
});
