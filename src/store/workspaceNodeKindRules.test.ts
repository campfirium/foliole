import { expect, it } from 'vitest';

import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { HOME_NODE_ID } from '../features/nodes/model/specialNodes';

import { canCreateChildUnderParent, canMoveRootsIntoTarget } from './workspaceNodeKindRules';

it('does not allow folders under topics', () => {
  expect(canCreateChildNodeKind('topic', 'folder')).toBe(false);
  expect(canCreateChildNodeKind('topic', 'topic')).toBe(true);
  expect(canCreateChildNodeKind('topic', 'item')).toBe(true);
});

it('does not allow Home as a real child-creation or move target', () => {
  const state = {
    nodesById: {
      [HOME_NODE_ID]: { id: HOME_NODE_ID, kind: 'folder', specialKind: 'home' },
      'topic-1': { id: 'topic-1', kind: 'topic' }
    }
  } as never;

  expect(canCreateChildUnderParent(state, HOME_NODE_ID, 'topic')).toBe(false);
  expect(canMoveRootsIntoTarget(state, ['topic-1'], ['topic-1'], HOME_NODE_ID, 'child')).toBe(false);
});
