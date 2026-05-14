import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

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

  return render(
    <StrictMode>
      <WorkspaceRightSidebarBacklinksPanel
        activeNodeId={activeNodeId}
        nodeOrder={['target', 'source']}
        nodesById={nodesById}
        onSelectNode={vi.fn()}
        trashedNodeIds={[]}
      />
    </StrictMode>
  );
}

function expectNoHookOrderWarning(messages: string[]) {
  expect(messages.join('\n')).not.toMatch(/Rendered (more|fewer) hooks|change in the order of Hooks/i);
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
