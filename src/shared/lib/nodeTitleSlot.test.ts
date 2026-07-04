import { describe, expect, it } from 'vitest';

import {
  hasVisibleTitleHeading,
  shouldReserveNodeTitleSlot
} from './nodeTitleSlot';

const node = { id: 'node-1', kind: 'topic', parentNodeId: null };

describe('nodeTitleSlot', () => {
  it('treats a body H1 as visible even when legacy hideTitleHeading is true', () => {
    expect(hasVisibleTitleHeading('# Article title\n\nBody', true)).toBe(true);
  });

  it('does not reserve title space when a visible H1 exists', () => {
    expect(shouldReserveNodeTitleSlot({
      content: '# Article title\n\nBody',
      hideTitleHeading: true,
      node,
      nodesById: { [node.id]: node }
    })).toBe(false);
  });

  it('reserves title space when the body has no H1', () => {
    expect(shouldReserveNodeTitleSlot({
      content: 'Body only',
      hideTitleHeading: false,
      node,
      nodesById: { [node.id]: node }
    })).toBe(true);
  });
});
