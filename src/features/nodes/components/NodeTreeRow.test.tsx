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

it('keeps selected rows in the calm list selection style', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected
      label="Study prompt"
      nodeId="node-1"
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  const row = screen.getByRole('treeitem', { name: 'Study prompt' });
  expect(row).toHaveAttribute('aria-selected', 'true');
  expect(row).not.toHaveAttribute('aria-pressed');
  expect(row).toHaveAttribute('data-active', 'false');
  expect(row.className).toContain('before:top-0.5');
  expect(row.className).toContain('before:bottom-0.5');
  expect(row.className).toContain('before:bg-foreground/[0.05]');
  expect(row.className).not.toContain('border-border-strong');
  expect(row.className).not.toContain('shadow-[inset_2px_0_0_rgb(var(--color-border-strong))]');
});

it('keeps bulk-selected rows in place without using the active button style', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isBulkSelectionActive
      isCollapsed={false}
      isSelected
      label="Study prompt"
      nodeId="node-1"
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  const row = screen.getByRole('treeitem', { name: 'Study prompt' });
  expect(row).toHaveAttribute('data-active', 'false');
  expect(row).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(row.className).not.toContain('my-0.5');
  expect(row).toHaveStyle({ paddingTop: '0px', paddingBottom: '0px' });
  expect(row.className).not.toContain('shadow-[inset_2px_0_0_rgb(var(--color-border-strong))]');
});

it('uses a lighter location highlight without selecting the row', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isHighlighted
      isSelected={false}
      label="Containing folder"
      nodeId="node-folder"
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  const row = screen.getByRole('treeitem', { name: 'Containing folder' });
  expect(row).toHaveAttribute('aria-selected', 'false');
  expect(row).toHaveAttribute('data-node-location-highlight', 'true');
  expect(row.className).toContain('before:bg-foreground/[0.035]');
  expect(row.className).not.toContain('after:bg-foreground/30');
});

it('selects a row without toggling collapse on plain row click', () => {
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
  expect(onToggleCollapse).not.toHaveBeenCalled();
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

it('starts inline rename on double click', () => {
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Draft topic"
      nodeId="node-1"
      onRename={vi.fn()}
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Draft topic' }));

  const input = screen.getByRole('textbox', { name: 'Rename Draft topic' });
  expect(input).toHaveValue('Draft topic');
  expect(input.className).not.toContain('ring-ring');
});

it('leaves F2 to the configurable app command route', () => {
  const onKeyDown = vi.fn();
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Draft topic"
      nodeId="node-1"
      onKeyDown={onKeyDown}
      onRename={vi.fn()}
      onSelect={vi.fn()}
      onToggleCollapse={vi.fn()}
      rowSpacing={0}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Draft topic' }), { key: 'F2' });

  expect(onKeyDown).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('textbox', { name: 'Rename Draft topic' })).not.toBeInTheDocument();
});
