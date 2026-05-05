import { UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';

import type { WorkspaceState } from './workspaceStore';

const ROOT_PARENT_KEY = '__root__';
const UNTITLED_TITLE_PATTERN = /^Untitled(?: (\d+))?$/;

function toParentKey(parentNodeId: string | null) {
  return parentNodeId ?? ROOT_PARENT_KEY;
}

function readNextUntitledSequence(title: string) {
  const match = title.trim().match(UNTITLED_TITLE_PATTERN);
  if (!match) {
    return null;
  }
  return match[1] ? Number.parseInt(match[1], 10) + 1 : 1;
}

function listActiveSiblingTitles(parentNodeId: string | null, state: WorkspaceState) {
  const trashedNodeIds = new Set(state.trashedNodeIds);
  return state.nodeOrder
    .filter((nodeId) => !trashedNodeIds.has(nodeId))
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node && node.parentNodeId === parentNodeId)
    .map((node) => node.title);
}

export function resolveCreatedNodeTitleState(
  derivedTitle: string,
  parentNodeId: string | null,
  state: WorkspaceState
) {
  if (derivedTitle !== UNTITLED_NODE_TITLE) {
    return {
      title: derivedTitle,
      untitledSequenceByParent: state.untitledSequenceByParent
    };
  }

  const parentKey = toParentKey(parentNodeId);
  const siblingTitles = listActiveSiblingTitles(parentNodeId, state);
  const siblingNextSequence = siblingTitles.reduce((maxSequence, title) => {
    const nextSequence = readNextUntitledSequence(title);
    return nextSequence === null ? maxSequence : Math.max(maxSequence, nextSequence);
  }, 0);

  if (siblingNextSequence === 0) {
    return {
      title: UNTITLED_NODE_TITLE,
      untitledSequenceByParent: {
        ...state.untitledSequenceByParent,
        [parentKey]: 1
      }
    };
  }

  const nextSequence = Math.max(state.untitledSequenceByParent[parentKey] ?? 0, siblingNextSequence);
  return {
    title: `${UNTITLED_NODE_TITLE} ${nextSequence}`,
    untitledSequenceByParent: {
      ...state.untitledSequenceByParent,
      [parentKey]: nextSequence + 1
    }
  };
}
