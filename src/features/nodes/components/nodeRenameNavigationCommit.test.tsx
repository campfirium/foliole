import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { commitActiveNodeRename } from './nodeRenameCommitCapability';
import { NodeTreeRow } from './NodeTreeRow';

it('commits the active title draft through the navigation save capability', async () => {
  const onRename = vi.fn(async () => true);
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive
      isCollapsed={false}
      isSelected
      label="Original"
      nodeId="node-1"
      onRename={onRename}
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );
  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Original' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Original' }), {
    target: { value: 'Saved before navigation' }
  });

  await act(async () => {
    expect(await commitActiveNodeRename()).toBe(true);
  });

  expect(onRename).toHaveBeenCalledWith('node-1', 'Saved before navigation');
  expect(screen.queryByRole('textbox', { name: 'Rename Original' })).toBeNull();
});

it('keeps the title draft active when navigation-triggered commit fails', async () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive
      isCollapsed={false}
      isSelected
      label="Original"
      nodeId="node-1"
      onRename={vi.fn(async () => false)}
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );
  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Original' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Rename Original' }), {
    target: { value: 'Unsaved title' }
  });

  await act(async () => {
    expect(await commitActiveNodeRename()).toBe(false);
  });

  expect(screen.getByRole('textbox', { name: 'Rename Original' })).toHaveValue('Unsaved title');
});
