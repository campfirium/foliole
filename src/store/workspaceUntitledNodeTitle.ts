import { UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';

import type { WorkspaceState } from './workspaceStore';

const GLOBAL_SEQUENCE_KEY = '__global__';
const UNTITLED_TITLE_PATTERN = /^Untitled(?: (\d+))?$/;

function readNextUntitledSequence(title: string) {
  const match = title.trim().match(UNTITLED_TITLE_PATTERN);
  if (!match) {
    return null;
  }
  return match[1] ? Number.parseInt(match[1], 10) + 1 : 1;
}

function listGeneratedActiveTitles(state: WorkspaceState) {
  const trashedNodeIds = new Set(state.trashedNodeIds);
  return state.nodeOrder
    .filter((nodeId) => !trashedNodeIds.has(nodeId))
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node): node is NonNullable<typeof node> => Boolean(node && !node.isTitleManual))
    .map((node) => node.title);
}

export function resolveCreatedNodeTitleState(
  derivedTitle: string,
  _parentNodeId: string | null,
  state: WorkspaceState
) {
  if (derivedTitle !== UNTITLED_NODE_TITLE) {
    return {
      title: derivedTitle,
      untitledSequenceByParent: state.untitledSequenceByParent
    };
  }

  const activeTitles = listGeneratedActiveTitles(state);
  const activeNextSequence = activeTitles.reduce((maxSequence, title) => {
    const nextSequence = readNextUntitledSequence(title);
    return nextSequence === null ? maxSequence : Math.max(maxSequence, nextSequence);
  }, 0);

  if (activeNextSequence === 0) {
    return {
      title: UNTITLED_NODE_TITLE,
      untitledSequenceByParent: {
        ...state.untitledSequenceByParent,
        [GLOBAL_SEQUENCE_KEY]: 1
      }
    };
  }

  const nextSequence = Math.max(
    state.untitledSequenceByParent[GLOBAL_SEQUENCE_KEY] ?? 0,
    activeNextSequence
  );
  return {
    title: `${UNTITLED_NODE_TITLE} ${nextSequence}`,
    untitledSequenceByParent: {
      ...state.untitledSequenceByParent,
      [GLOBAL_SEQUENCE_KEY]: nextSequence + 1
    }
  };
}
