export type NodeTreeRowIconKind = 'reading' | 'review';
export type NodeTreeRowIconState = 'pending' | 'scheduled' | 'dismissed';

export function resolveNodeTreeRowIconKind(isReviewCard: boolean): NodeTreeRowIconKind {
  return isReviewCard ? 'review' : 'reading';
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
