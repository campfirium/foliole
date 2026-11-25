/**
 * A reading competes in sync by its latest deliberate act: the last time it was handled, or the
 * moment an undo or redo put a profile back. Restoring an earlier profile keeps its old handled time
 * (scheduling and postponing count from it), so without the history order an undo would lose to the
 * very reading it reversed.
 */
export function readingOrderAt(lastHandledAt: string, historyOrderAt: string | null | undefined) {
  return historyOrderAt && historyOrderAt > lastHandledAt ? historyOrderAt : lastHandledAt;
}

/**
 * The order an undo or redo stamps on the profile it restores: its own time, but always after the
 * reading it replaces, so a slow device clock cannot let the replaced reading win back.
 */
export function nextReadingHistoryOrderAt(
  now: string,
  replaced: { history_order_at: string | null; last_handled_at: string } | null | undefined
) {
  if (!replaced) return now;
  const after = new Date(Date.parse(readingOrderAt(replaced.last_handled_at, replaced.history_order_at)) + 1).toISOString();
  return after > now ? after : now;
}
