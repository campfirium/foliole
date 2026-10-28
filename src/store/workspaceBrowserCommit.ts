import { captureBrowserReviewBases } from '../shared/platform/runtime/browserReviewProjection';

import type { WorkspaceState } from './workspaceStoreTypes';

type BrowserCommitOwner = { save(state: WorkspaceState): void };
let owner: BrowserCommitOwner | null = null;
export function installWorkspaceBrowserCommit(value: BrowserCommitOwner | null) { owner = value; }
export function hasWorkspaceBrowserCommit() { return Boolean(owner); }

// This is called before Zustand publishes, including ordinary edits to the same envelope.
export function prepareBrowserWorkspacePublish(current: WorkspaceState, patch: Partial<WorkspaceState>): Partial<WorkspaceState> {
  if (!owner) return patch;
  let next = { ...current, ...patch };
  let flow = next.browserDailyFlow;
  if (flow) {
    const added = Object.fromEntries(Object.entries(next.nodesById).filter(([id, node]) =>
      node.kind === 'item' && current.nodesById[id]?.kind !== 'item'));
    const captured = captureBrowserReviewBases(flow, added);
    if (captured !== flow) next = { ...next, browserDailyFlow: captured };
    flow = captured;
  }
  if (flow?.state && flow === current.browserDailyFlow &&
    learningSourcesChanged(current, next)) {
    next = { ...next, browserDailyFlow: { ...flow, state: { ...flow.state, invalidated: 1 } } };
  }
  owner.save(next);
  return next;
}

function learningSourcesChanged(current: WorkspaceState, next: WorkspaceState) {
  if (JSON.stringify(next.nodeOrder) !== JSON.stringify(current.nodeOrder) ||
    JSON.stringify(next.trashedNodeIds) !== JSON.stringify(current.trashedNodeIds)) return true;
  if (next.nodesById === current.nodesById) return false;
  const fields = ['kind', 'parentNodeId', 'priority', 'deletedAt', 'shelvedAt', 'review', 'reading',
    'manualChildOrder', 'sequentialReadingEnabled'] as const;
  return [...new Set([...Object.keys(current.nodesById), ...Object.keys(next.nodesById)])].some(id => {
    const before = current.nodesById[id];
    const after = next.nodesById[id];
    if (before === after) return false;
    if (!before || !after) return true;
    return fields.some(field => JSON.stringify(before[field]) !== JSON.stringify(after[field])) ||
      Boolean(before.content.trim()) !== Boolean(after.content.trim()) ||
      Boolean(before.reveal) !== Boolean(after.reveal) || before.anchorLink?.kind !== after.anchorLink?.kind;
  });
}
