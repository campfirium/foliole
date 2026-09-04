import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  baseNode,
  buildSectionProps,
  createSectionElement,
  documentPanelBodyMock,
  loadRuntimeNodeBacklinks,
  renderSection,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

const READER_END_CUSHION_PADDING = 'clamp(calc(var(--workspace-bottom-toolbar-height) + 1.5rem), 36dvh, 26rem)';

function expectDocumentBodyLayout(args: {
  editorContentPaddingBottom: string | undefined;
  fitBlockImagesToViewport: boolean;
}) {
  expect(
    documentPanelBodyMock.mock.calls.some(([props]) =>
      props &&
      typeof props === 'object' &&
      (props as { editorContentPaddingBottom?: string }).editorContentPaddingBottom === args.editorContentPaddingBottom &&
      ((props as { fitBlockImagesToViewport?: boolean }).fitBlockImagesToViewport ?? false) === args.fitBlockImagesToViewport
    )
  ).toBe(true);
}

function renderMutableBacklinksScenario() {
  const nodesById: Record<string, Node> = {
    'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
    'node-2': {
      ...baseNode,
      id: 'node-2',
      title: 'Linked note',
      content: 'No backlink yet.'
    }
  };
  const props = buildSectionProps({
    nodeOrder: ['node-1', 'node-2'],
    nodesById
  });
  const view = render(
    createSectionElement({
      nodeOrder: props.nodeOrder,
      nodesById: props.nodesById
    })
  );

  return { nodesById, props, view };
}

function renderTopicBacklinksView() {
  renderSectionWithProps({
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Linked note',
        content: 'See [[Node 1]] for the follow-up.'
      }
    }
  });
}

function renderRuntimeBacklinksView() {
  loadRuntimeNodeBacklinks.mockResolvedValue([
    {
      sourceNodeId: 'node-2',
      sourceTitle: 'Linked note',
      context: 'See [[Node 1]] for the follow-up.',
      matchCount: 1
    }
  ] as never);

  renderSectionWithProps({
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Linked note',
        content: '',
        hasContent: true
      }
    }
  });
}

describe('DocumentPanelSection primary views', () => {
  it('hides the source update action when no source update is available', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Toggle source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('renders the document body without passing a visible kind label', () => {
    renderSection();

    expect(screen.getByText('Document body')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Document panel' }).querySelector('[data-panel-scale-id="document-panel"]')).not.toBeNull();
  });

  it('keeps topic documents renderable when backlinks exist', async () => {
    renderTopicBacklinksView();

    expect(screen.getByText('Document body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument();
    await waitFor(() =>
      expectDocumentBodyLayout({
        editorContentPaddingBottom: READER_END_CUSHION_PADDING,
        fitBlockImagesToViewport: false
      })
    );
  });

  it('refreshes backlinks without requiring a node switch when node content mutates in place', () => {
    const { nodesById, props, view } = renderMutableBacklinksScenario();

    expect(screen.queryByRole('button', { name: 'Open link references (1)' })).not.toBeInTheDocument();

    nodesById['node-2']!.content = 'See [[Node 1]] for the follow-up.';
    view.rerender(
      createSectionElement({
        nodeOrder: props.nodeOrder,
        nodesById: props.nodesById
      })
    );

    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument();
  });

it('shows backlinks from runtime-backed data even when source documents are trimmed in memory', async () => {
  renderRuntimeBacklinksView();

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument()
  );
});

});

describe('DocumentPanelSection secondary views', () => {
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
    expect(screen.queryByRole('button', { name: /open link references/i })).not.toBeInTheDocument();
  });

  it('shows the folder list shell for ordinary folder nodes', () => {
    render(
      <MouseGestureSettingsProvider>
        {createSectionElement({
          activeNodeId: 'node-1',
          editorNodeId: 'node-1',
          nodeOrder: ['node-1', 'node-2'],
          nodesById: {
            'node-1': { ...baseNode, kind: 'folder', content: 'Folder prose should stay hidden' },
            'node-2': { ...baseNode, id: 'node-2', parentNodeId: 'node-1', title: 'Child topic', content: '# Child topic' }
          }
        })}
      </MouseGestureSettingsProvider>
    );

    expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Node 1' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'List panel' }).querySelector('[data-panel-scale-id="list-panel"]')).not.toBeNull();
    expect(screen.queryByRole('separator', { name: /Resize document width/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
  });

});

it('shows saved virtual searches as read-only lists without document controls', () => {
  useWorkspaceStore.setState({ updateVirtualNodeFilter: vi.fn() });
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'folder',
        specialKind: 'virtual',
        title: 'Saved search',
        virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'alpha' }], match: 'all', version: 1 }
      }
    }
  });

  expect(screen.getByRole('region', { name: 'Virtual search' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'List panel' }).querySelector('[data-panel-scale-id="list-panel"]')).not.toBeNull();
  expect(screen.queryByText('Search titles and topic text. Matching topics appear in the topic list.')).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Search topics to save as list' })).toHaveAttribute('readonly');
  expect(screen.getByRole('searchbox', { name: 'Search topics to save as list' })).toHaveClass('text-foreground/50');
  expect(screen.getByRole('searchbox', { name: 'Search topics to save as list' })).toHaveValue('alpha');
  expect(screen.queryByRole('button', { name: 'Clear folder search' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics to save as list' }), { target: { value: 'beta' } });
  expect(useWorkspaceStore.getState().updateVirtualNodeFilter).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Priority P5/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More editor options' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
  expect(screen.queryByText('Saved filter')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save and run' })).toBeNull();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});
