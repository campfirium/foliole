import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeTreeRow } from './NodeTreeRow';

it('shows markdown node titles as plain list text outside rename mode', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="- **这个版本切换**，其实等于是在做一个确认"
      nodeId="node-1"
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  expect(screen.getByRole('treeitem', { name: '这个版本切换，其实等于是在做一个确认' })).toBeInTheDocument();
  expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
});
