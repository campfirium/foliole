export type NodeTreeRowIconKind = 'reading' | 'review';
export type NodeTreeRowIconState = 'default' | 'queued' | 'current' | 'done' | 'dismissed';

export function resolveNodeTreeRowIconKind(isReviewCard: boolean): NodeTreeRowIconKind {
  return isReviewCard ? 'review' : 'reading';
}

export function resolveNodeTreeRowIconState(args: {
  isDismissed: boolean;
  isCurrent: boolean;
  isQueued: boolean;
}): NodeTreeRowIconState {
  if (args.isDismissed) {
    return 'dismissed';
  }
  if (args.isCurrent) {
    return 'current';
  }
  if (args.isQueued) {
    return 'queued';
  }
  return 'default';
}
