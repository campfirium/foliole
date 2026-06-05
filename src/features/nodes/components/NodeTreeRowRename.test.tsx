import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeTreeRow } from './NodeTreeRow';

it('cancels inline rename with Escape without submitting the draft', () => {
  const onRename = vi.fn();
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Draft topic"
      nodeId="node-1"
      onRename={onRename}
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Draft topic' }));
  const input = screen.getByRole('textbox', { name: 'Rename Draft topic' });
  fireEvent.change(input, { target: { value: 'Changed topic' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  fireEvent.blur(input);

  expect(screen.getByRole('treeitem', { name: 'Draft topic' })).toBeInTheDocument();
  expect(onRename).not.toHaveBeenCalled();
});
