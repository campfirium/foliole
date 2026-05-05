import { fireEvent, render, screen } from '@testing-library/react';
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

it('can hide navigation icons', () => {
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
      showIcon={false}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'Study prompt' }).querySelector('[data-node-icon]')).toBeNull();
});

it('toggles collapse on plain row click when children exist', () => {
  const onSelect = vi.fn();
  const onToggleCollapse = vi.fn();

  render(
    <NodeTreeRow
      depth={0}
      hasChildren
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Folder"
      nodeId="node-folder"
      onSelect={onSelect}
      onToggleCollapse={onToggleCollapse}
      rowSpacing={0}
    />
  );

  fireEvent.click(screen.getByRole('treeitem', { name: 'Folder' }));

  expect(onSelect).toHaveBeenCalledWith('node-folder', {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false
  });
  expect(onToggleCollapse).toHaveBeenCalledWith('node-folder');
});

it('does not toggle collapse on modified row click', () => {
  const onSelect = vi.fn();
  const onToggleCollapse = vi.fn();

  render(
    <NodeTreeRow
      depth={0}
      hasChildren
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Folder"
      nodeId="node-folder"
      onSelect={onSelect}
      onToggleCollapse={onToggleCollapse}
      rowSpacing={0}
    />
  );

  fireEvent.click(screen.getByRole('treeitem', { name: 'Folder' }), { ctrlKey: true });

  expect(onSelect).toHaveBeenCalledWith('node-folder', {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false
  });
  expect(onToggleCollapse).not.toHaveBeenCalled();
});
