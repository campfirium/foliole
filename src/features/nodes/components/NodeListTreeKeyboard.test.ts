import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { expect, it, vi } from 'vitest';

import { createNodeListRowKeydownHandler } from './NodeListTreeKeyboard';

it('does not reinterpret a direction key already consumed by a global shortcut', () => {
  const onSelect = vi.fn();
  const preventDefault = vi.fn();
  const handler = createNodeListRowKeydownHandler({
    collapsedNodeIds: new Set(),
    onSelect,
    onToggleCollapse: vi.fn(),
    rows: [
      { depth: 0, hasChildren: true, id: 'parent' },
      { depth: 1, hasChildren: false, id: 'first-child' }
    ]
  });
  const event = {
    defaultPrevented: true,
    key: 'ArrowDown',
    preventDefault
  } as unknown as ReactKeyboardEvent<HTMLButtonElement>;

  handler('parent', event);

  expect(onSelect).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
});

it('lets an enabled forward Tab leave the tree through its owner', () => {
  const onTab = vi.fn(() => true);
  const preventDefault = vi.fn();
  const handler = createNodeListRowKeydownHandler({
    collapsedNodeIds: new Set(),
    onSelect: vi.fn(),
    onTab,
    onToggleCollapse: vi.fn(),
    rows: [{ depth: 0, hasChildren: false, id: 'topic' }]
  });
  const event = {
    currentTarget: document.createElement('button'),
    defaultPrevented: false,
    key: 'Tab',
    preventDefault,
    shiftKey: false
  } as unknown as ReactKeyboardEvent<HTMLButtonElement>;

  handler('topic', event);

  expect(onTab).toHaveBeenCalledWith('topic', event);
  expect(preventDefault).toHaveBeenCalledOnce();
});
