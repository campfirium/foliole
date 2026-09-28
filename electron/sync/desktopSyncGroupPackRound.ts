export function assertPackRound(
  args: { frontierStateSeq?: number; restoreId?: string; sourceEpoch?: string },
  manifest: { frontierStateSeq: number; restoreId?: string; sourceEpoch: string }
) {
  if (args.restoreId && manifest.restoreId !== args.restoreId) {
    throw new Error('sync_group_restore_pack_mismatch');
  }
  if ((args.frontierStateSeq !== undefined && manifest.frontierStateSeq !== args.frontierStateSeq) ||
      (args.sourceEpoch && manifest.sourceEpoch !== args.sourceEpoch)) {
    throw new Error('sync_pack_round_changed');
  }
}
