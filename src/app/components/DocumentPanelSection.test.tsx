import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  baseNode,
  documentPanelBodyMock,
  renderSection,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

function expectDocumentBodyLayout(args: {
  editorContentPaddingBottom: string | undefined;
  fitBlockImagesToViewport: boolean;
}) {
  expect(
    documentPanelBodyMock.mock.calls.some(([props]) =>
      props &&
      typeof props === 'object' &&
      'editorContentPaddingBottom' in props &&
      'fitBlockImagesToViewport' in props &&
      (props as { editorContentPaddingBottom?: string }).editorContentPaddingBottom === args.editorContentPaddingBottom &&
      (props as { fitBlockImagesToViewport?: boolean }).fitBlockImagesToViewport === args.fitBlockImagesToViewport
    )
  ).toBe(true);
}

describe('DocumentPanelSection basic views', () => {
  it('hides the source update action when no source update is available', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Toggle source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('renders the document body without passing a visible kind label', () => {
    renderSection();

    expect(screen.getByText('Document body')).toBeInTheDocument();
  });

  it('keeps the extra document tail for topic nodes in preview mode', () => {
    renderSectionWithProps({
      nodesById: {
        'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' }
      }
    });

    expectDocumentBodyLayout({
      editorContentPaddingBottom: 'min(68dvh, 36rem)',
      fitBlockImagesToViewport: false
    });
  });

  it('does not add the extra document tail for item nodes', () => {
    renderSectionWithProps({
      showAnswerSection: true,
      nodesById: {
        'node-1': { ...baseNode, kind: 'item', content: '# Prompt', reveal: 'Answer' }
      }
    });

    expectDocumentBodyLayout({
      editorContentPaddingBottom: undefined,
      fitBlockImagesToViewport: false
    });
  });

  it('shows the folder list shell for ordinary folder nodes', () => {
    renderSectionWithProps({
      activeNodeId: 'node-1',
      editorNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': { ...baseNode, kind: 'folder', content: 'Folder prose should stay hidden' },
        'node-2': { ...baseNode, id: 'node-2', parentNodeId: 'node-1', title: 'Child topic', content: '# Child topic' }
      }
    });

    expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
  });
});

it('shows the virtual node detail shell with clear empty states', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': { ...baseNode, kind: 'folder', specialKind: 'virtual', title: 'Saved search' }
    }
  });

  expect(screen.getByRole('region', { name: 'Virtual node details' })).toBeInTheDocument();
  expect(screen.getByText('Saved filter')).toBeInTheDocument();
  expect(screen.getByText('Saved value: none')).toBeInTheDocument();
  expect(screen.getByText('No saved filter yet')).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});

it('reuses the folder list module for virtual node results and opens the original article node', () => {
  const onSelectNode = vi.fn();

  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'folder',
        specialKind: 'virtual',
        title: 'Saved search',
        virtualFilter: {
          version: 1,
          match: 'all',
          conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
        }
      },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Reader article',
        content: 'A reader note that should appear in the reused list.'
      },
      'node-3': {
        ...baseNode,
        id: 'node-3',
        title: 'Another note',
        content: 'No matching keyword here.'
      }
    },
    onSelectNode
  });

  expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-title-node-2')).toHaveTextContent('Reader article');
  expect(screen.queryByTestId('folder-list-title-node-3')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open Reader article' }));

  expect(onSelectNode).toHaveBeenCalledWith('node-2');
});

it('saves the virtual node keyword through the detail form', () => {
  const onNodeContentChange = vi.fn();

  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': { ...baseNode, kind: 'folder', specialKind: 'virtual', title: 'Saved search' }
    },
    onNodeContentChange
  });

  fireEvent.change(screen.getByLabelText('Keyword'), { target: { value: 'reader' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and run' }));

  expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'reader');
});

it('shows a loading state before workspace hydration finishes', () => {
  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isWorkspaceHydrated: false,
    nodesById: {}
  });

  expect(
    documentPanelBodyMock.mock.calls.some(([props]) =>
      props &&
      typeof props === 'object' &&
      'emptyState' in props &&
      'emptyContent' in props &&
      (props as { emptyState?: { title?: string } }).emptyState?.title === 'Loading workspace' &&
      Boolean((props as { emptyContent?: unknown }).emptyContent)
    )
  ).toBe(true);
});

it('shows an empty state after hydration when no note is selected', () => {
  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isWorkspaceHydrated: true,
    nodesById: {}
  });

  expect(
    documentPanelBodyMock.mock.calls.some(([props]) =>
      props &&
      typeof props === 'object' &&
      'emptyState' in props &&
      'emptyContent' in props &&
      (props as { emptyState?: { title?: string } }).emptyState?.title === 'No note selected' &&
      !(props as { emptyContent?: unknown }).emptyContent
    )
  ).toBe(true);
});
