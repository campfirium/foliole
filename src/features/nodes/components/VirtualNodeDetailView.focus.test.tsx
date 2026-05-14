import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../model/nodeTypes';

import { VirtualNodeDetailView } from './VirtualNodeDetailView';

const virtualNode: Node = {
  content: '',
  createdAt: '2026-05-14T00:00:00.000Z',
  id: 'virtual-1',
  kind: 'folder',
  parentNodeId: null,
  reveal: null,
  review: null,
  specialKind: 'virtual',
  title: 'Saved search',
  updatedAt: '2026-05-14T00:00:00.000Z',
  virtualFilter: {
    conditions: [{
      field: 'text',
      operator: 'contains',
      value: 'reading'
    }],
    match: 'all',
    version: 1
  }
};

it('keeps the virtual node filter textarea keyboard focus visible', () => {
  render(
    <VirtualNodeDetailView
      node={virtualNode}
      nodesById={{ 'virtual-1': virtualNode }}
      onSelectNode={vi.fn()}
      onSelectNodePath={vi.fn()}
      onUpdateFilter={vi.fn()}
    />
  );

  const textarea = screen.getByLabelText('Keyword');
  expect(textarea.className).toContain('focus-visible:border-border-strong');
  expect(textarea.className).toContain('focus-visible:outline-none');
  expect(textarea.className).toContain('focus-visible:ring-1');
  expect(textarea.className).toContain('focus-visible:ring-ring');
});
