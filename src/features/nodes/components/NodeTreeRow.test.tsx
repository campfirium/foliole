import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeTreeRow } from './NodeTreeRow';

it('shows the row title without a kind label prefix', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Study prompt"
      nodeId="node-1"
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'Study prompt' })).toBeInTheDocument();
  expect(screen.queryByText('Item')).not.toBeInTheDocument();
});
