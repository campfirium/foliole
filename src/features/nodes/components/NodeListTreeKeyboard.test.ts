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
