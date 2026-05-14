import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import {
  baseNode,
  buildSectionProps,
  createSectionElement,
  renderSectionWithProps,
  loadRuntimeNodeBacklinks
} from './DocumentPanelSection.testSupport';

it('renders topic documents when runtime backlinks have no links', () => {
  renderSectionWithProps({
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' }
    }
  });

  expect(screen.getByText('Document body')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Open link references/ })).not.toBeInTheDocument();
});

it('does not reload runtime backlinks when only surrounding node content changes', async () => {
  loadRuntimeNodeBacklinks.mockResolvedValue([
    {
      sourceNodeId: 'node-2',
      sourceTitle: 'Linked note',
      context: 'See [[Node 1]] for the follow-up.',
      matchCount: 1
    }
  ] as never);

  const nodesById: Record<string, Node> = {
    'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
    'node-2': {
      ...baseNode,
      id: 'node-2',
      title: 'Linked note',
      content: ''
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

  await waitFor(() => expect(loadRuntimeNodeBacklinks).toHaveBeenCalledTimes(1));

  nodesById['node-2']!.content = 'Updated surrounding content.';
  view.rerender(
    createSectionElement({
      nodeOrder: props.nodeOrder,
      nodesById: props.nodesById
    })
  );

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument()
  );
  expect(loadRuntimeNodeBacklinks).toHaveBeenCalledTimes(1);
});
