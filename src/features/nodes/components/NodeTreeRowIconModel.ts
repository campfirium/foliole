import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';

export type NodeTreeRowIconKind = 'folder-closed' | 'folder-open' | 'reading' | 'review';
export type NodeTreeRowIconState = 'pending' | 'scheduled' | 'dismissed';

export function resolveNodeTreeRowIconKind(args: {
  hasChildren: boolean;
  isCollapsed: boolean;
  isReviewCard: boolean;
  kind: NodeKind;
}): NodeTreeRowIconKind {
  if (args.kind === 'folder') {
    return args.hasChildren && !args.isCollapsed ? 'folder-open' : 'folder-closed';
  }

  if (args.isReviewCard) {
    return 'review';
  }

  return 'reading';
}

export function resolveNodeTreeRowIconState(args: {
  hasEnteredSchedule: boolean;
  isDismissed: boolean;
}): NodeTreeRowIconState {
  if (args.isDismissed) {
    return 'dismissed';
  }
  return args.hasEnteredSchedule ? 'scheduled' : 'pending';
}
