import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow } from './NodeTreeRow';

function renderFolderRow(handlers?: {
  onSelect?: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse?: (nodeId: string) => void;
}) {
  const onSelect = handlers?.onSelect ?? vi.fn();
  const onToggleCollapse = handlers?.onToggleCollapse ?? vi.fn();
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
  return screen.getByRole('treeitem', { name: 'Folder' });
}

function renderTopicRow(handlers?: {
  onSelect?: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse?: (nodeId: string) => void;
}) {
  const onSelect = handlers?.onSelect ?? vi.fn();
  const onToggleCollapse = handlers?.onToggleCollapse ?? vi.fn();
  render(
    <NodeTreeRow
      depth={0}
      hasChildren={false}
      isActive={false}
      isCollapsed={false}
      isSelected={false}
      label="Topic"
      nodeId="node-topic"
      onSelect={onSelect}
      onToggleCollapse={onToggleCollapse}
      rowSpacing={0}
    />
  );
  return screen.getByRole('treeitem', { name: 'Topic' });
}

it('keeps the collapse chevron out of the row tab sequence', () => {
  const row = renderFolderRow();
  const chevron = row.querySelector('[data-node-tree-chevron="true"]');

  expect(chevron).toHaveAttribute('aria-hidden', 'true');
  expect(row.querySelector('[role="button"]')).toBeNull();
  expect(row.querySelector('[tabindex="0"]')).toBeNull();
  expect(row.querySelectorAll([
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', '))).toHaveLength(0);
});

it('toggles collapse from chevron clicks without selecting the row', () => {
  const onSelect = vi.fn();
  const onToggleCollapse = vi.fn();
  const row = renderFolderRow({ onSelect, onToggleCollapse });

  fireEvent.click(row.querySelector('[data-node-tree-chevron="true"]') as HTMLElement);

  expect(onToggleCollapse).toHaveBeenCalledWith('node-folder');
  expect(onSelect).not.toHaveBeenCalled();
});

it('shows a disabled chevron placeholder for rows without expandable content', () => {
  const onToggleCollapse = vi.fn();
  const row = renderTopicRow({ onToggleCollapse });
  const placeholder = row.querySelector('[data-node-tree-chevron-placeholder="true"]');

  expect(placeholder).toHaveAttribute('aria-hidden', 'true');
  expect(placeholder?.className).toContain('opacity-15');
  expect(row.querySelector('[data-node-tree-chevron="true"]')).toBeNull();
  expect(row.querySelector('[role="button"]')).toBeNull();

  fireEvent.click(placeholder as HTMLElement);

  expect(onToggleCollapse).not.toHaveBeenCalled();
});
