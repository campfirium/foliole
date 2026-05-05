import { expect, it } from 'vitest';

import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';

it('does not allow folders under topics', () => {
  expect(canCreateChildNodeKind('topic', 'folder')).toBe(false);
  expect(canCreateChildNodeKind('topic', 'topic')).toBe(true);
  expect(canCreateChildNodeKind('topic', 'item')).toBe(true);
});
