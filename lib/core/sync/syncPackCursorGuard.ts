export function assertSyncPackCursorAdvance(args: {
  appliedObjectCount: number;
  currentCursor: number;
  handledConflictCount: number;
  toStateSeq: number;
}) {
  if (
    args.toStateSeq > args.currentCursor &&
    args.appliedObjectCount === 0 &&
    args.handledConflictCount === 0
  ) {
    throw new Error('sync_pack_applied_no_objects');
  }
}
