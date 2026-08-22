export function assertSyncPackCursorAdvance(args: {
  appliedFactCount?: number;
  appliedObjectCount: number;
  currentCursor: number;
  handledConflictCount: number;
  toStateSeq: number;
}) {
  if (
    args.toStateSeq > args.currentCursor &&
    (args.appliedFactCount ?? 0) === 0 &&
    args.appliedObjectCount === 0 &&
    args.handledConflictCount === 0
  ) {
    throw new Error('sync_pack_applied_no_objects');
  }
}
