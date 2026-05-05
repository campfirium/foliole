export type NodeTreeRowIconKind = 'reading' | 'review';
export type NodeTreeRowIconState = 'pending' | 'active' | 'dismissed';

export function resolveNodeTreeRowIconKind(isReviewCard: boolean): NodeTreeRowIconKind {
  return isReviewCard ? 'review' : 'reading';
}

export function resolveNodeTreeRowIconState(args: {
  hasBeenHandled: boolean;
  isDismissed: boolean;
}): NodeTreeRowIconState {
  if (args.isDismissed) {
    return 'dismissed';
  }
  return args.hasBeenHandled ? 'active' : 'pending';
}
