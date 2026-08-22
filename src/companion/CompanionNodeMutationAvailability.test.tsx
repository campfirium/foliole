import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  articleDocumentProps: vi.fn(),
  immersiveArticleProps: vi.fn(),
  supportedSurfaces: new Set<string>()
}));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(),
  supportsCompanionNodeMutationSurface: (surface: string) => testState.supportedSurfaces.has(surface)
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
const IMMERSIVE_HANDLER_KEYS = [
  'onAddExistingHighlightNote',
  'onCreateSelectionAnnotation',
  'onDeleteExistingHighlight',
  'onRestoreFromTrash',
  'onSaveArticleContent'
] as const;
const IMMERSIVE_SURFACE_CASES = [
  ['existing-highlight-edit', ['onAddExistingHighlightNote', 'onDeleteExistingHighlight']],
  ['selection-annotation', ['onCreateSelectionAnnotation']],
  ['trash-restore', ['onRestoreFromTrash']],
  ['topic-content-edit', ['onSaveArticleContent']]
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  testState.supportedSurfaces = new Set([
    'existing-highlight-edit',
    'selection-annotation',
    'topic-content-edit',
    'trash-restore'
  ]);
});

it('omits all immersive mutation handlers when no interaction surface is accepted', () => {
  testState.supportedSurfaces.clear();

  render(<CompanionShellReadableArticle onExit={vi.fn()} surface={surface} workspaceSync={workspaceSync} />);

  const props = testState.immersiveArticleProps.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(props.onAddExistingHighlightNote).toBeUndefined();
  expect(props.onCreateSelectionAnnotation).toBeUndefined();
  expect(props.onDeleteExistingHighlight).toBeUndefined();
  expect(props.onRestoreFromTrash).toBeUndefined();
  expect(props.onSaveArticleContent).toBeUndefined();
});

it('keeps the non-immersive article read-only when topic editing is not accepted', () => {
  testState.supportedSurfaces.clear();

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

it.each(IMMERSIVE_SURFACE_CASES)('exposes only the independently accepted %s surface', (surfaceName, acceptedKeys) => {
  testState.supportedSurfaces = new Set([surfaceName]);
  const acceptedKeySet = new Set<string>(acceptedKeys);

  render(<CompanionShellReadableArticle onExit={vi.fn()} surface={surface} workspaceSync={workspaceSync} />);

  const props = testState.immersiveArticleProps.mock.calls[0]?.[0] as Record<string, unknown>;
  for (const key of IMMERSIVE_HANDLER_KEYS) {
    expect(props[key]).toEqual(acceptedKeySet.has(key) ? expect.any(Function) : undefined);
  }
});
