import { fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { inspectorPanelSectionClassName } from '../../shared/ui';

import { WorkspaceRightSidebarBacklinksPanel } from './WorkspaceRightSidebarBacklinksPanel';

const { loadRuntimeNodeBacklinks } = vi.hoisted(() => ({
  loadRuntimeNodeBacklinks: vi.fn()
}));

vi.mock('../../shared/platform/nodeBacklinksRuntimeRepository', () => ({
  loadRuntimeNodeBacklinks
}));

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'target',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Target topic',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-05-14T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-14T00:00:00.000Z'
  };
}

function createPanelNodes() {
  return {
    source: createNode({
      id: 'source',
      title: 'Source topic',
      content: 'See [[Target topic]] for context.'
    }),
    target: createNode({
      id: 'target',
      title: 'Target topic'
    })
  };
}

function renderPanelWithNodes(activeNodeId: string | null, nodesById: Record<string, Node>, nodeOrder = ['target', 'source']) {
  return renderWithLocalization(
    <StrictMode>
      <WorkspaceRightSidebarBacklinksPanel
        activeNodeId={activeNodeId}
        nodeOrder={nodeOrder}
        nodesById={nodesById}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </StrictMode>
  );
}

function renderPanel(activeNodeId: string | null) {
  const nodesById = {
    source: createNode({
      id: 'source',
      title: 'Source topic',
      content: 'See [[Target topic]] for context.'
    }),
    target: createNode({
      id: 'target',
      title: 'Target topic'
    })
  };

  return renderPanelWithNodes(activeNodeId, nodesById);
}

function expectNoHookOrderWarning(messages: string[]) {
  expect(messages.join('\n')).not.toMatch(/Rendered (more|fewer) hooks|change in the order of Hooks/i);
}

function expectBacklinksPanelInset() {
  const section = screen.getByRole('heading', { name: 'Backlinks' }).closest('section');
  expect(section).toHaveClass(inspectorPanelSectionClassName);
  expect(section).toHaveClass('bg-transparent');
  expect(screen.getByRole('button', { name: /source topic/i }).className).not.toContain('px-2');
}

beforeEach(() => {
  loadRuntimeNodeBacklinks.mockReset();
  loadRuntimeNodeBacklinks.mockResolvedValue(null);
});

it('keeps hook order stable while the active topic changes', async () => {
  const consoleErrors: string[] = [];
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    consoleErrors.push(args.map(String).join(' '));
  });

  const view = renderPanel(null);
  expect(screen.getByText(/select a topic/i)).toBeInTheDocument();

  view.rerender(
    <StrictMode>
      <WorkspaceRightSidebarBacklinksPanel
        activeNodeId="target"
        nodeOrder={['target', 'source']}
        nodesById={{
          source: createNode({
            id: 'source',
            title: 'Source topic',
            content: 'See [[Target topic]] for context.'
          }),
          target: createNode({
            id: 'target',
            title: 'Target topic'
          })
        }}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </StrictMode>
  );
  expect(await screen.findByRole('button', { name: /source topic/i })).toBeInTheDocument();
  expectBacklinksPanelInset();

  view.rerender(
    <StrictMode>
      <WorkspaceRightSidebarBacklinksPanel
        activeNodeId={null}
        nodeOrder={['target', 'source']}
        nodesById={{}}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </StrictMode>
  );
  expect(screen.getByText(/select a topic/i)).toBeInTheDocument();

  view.rerender(
    <StrictMode>
      <WorkspaceRightSidebarBacklinksPanel
        activeNodeId="missing"
        nodeOrder={[]}
        nodesById={{}}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </StrictMode>
  );

  await waitFor(() => expectNoHookOrderWarning(consoleErrors));
  expect(loadRuntimeNodeBacklinks).toHaveBeenCalledWith('target');
  expect(loadRuntimeNodeBacklinks).not.toHaveBeenCalledWith('missing');
  consoleErrorSpy.mockRestore();
});

it('shows a progress state when runtime backlinks are pending and no local backlinks exist', () => {
  loadRuntimeNodeBacklinks.mockImplementation(() => new Promise(() => undefined));

  renderPanelWithNodes('target', { target: createNode({ id: 'target', title: 'Target topic' }) }, ['target']);

  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
});

it('shows a retryable error when runtime backlinks fail without local backlinks', async () => {
  loadRuntimeNodeBacklinks
    .mockRejectedValueOnce(new Error('runtime failed'))
    .mockRejectedValueOnce(new Error('runtime failed'))
    .mockResolvedValueOnce([{ context: 'Runtime context', matchCount: 1, sourceNodeId: 'source', sourceTitle: 'Source topic' }]);

  renderPanelWithNodes('target', createPanelNodes(), ['target']);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Backlinks could not be loaded');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Source topic/ })).toBeInTheDocument();
  });
  expect(loadRuntimeNodeBacklinks).toHaveBeenCalledTimes(3);
});

it('shows an error when the selected backlinks topic is unavailable', () => {
  renderPanelWithNodes('missing', {});

  expect(screen.getByRole('alert')).toHaveTextContent('Topic unavailable');
});
