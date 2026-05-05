import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeTreeRow } from './NodeTreeRow';

it('shows the formal kind label in the row content', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Study prompt"
      nodeId="node-1"
      nodeKindLabel="Item"
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  expect(screen.getByText('Item')).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Study prompt' })).toBeInTheDocument();
});
