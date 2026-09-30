import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncGroupRestorePage } from '../../lib/core/sync/syncGroupRestorePageApply.js';
import type { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

export async function applyDesktopRestorePage(args: {
  after: number;
  apply: (port: DbPort, after: number) => ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>;
  frontierStateSeq: number;
  groupId: string;
  peerId: string;
  port: DbPort;
  restoreId: string;
}) {
  return args.port.transaction(async (tx) => {
    const outcome = await applySyncGroupRestorePage(tx, args);
    if (!outcome.result.restorePending && !outcome.result.dependencyProgress) {
      await tx.run(`INSERT INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at)
        VALUES (?, 'state', ?, ?) ON CONFLICT(peer_id, stream_name) DO UPDATE SET
        cursor_value = excluded.cursor_value, updated_at = excluded.updated_at`,
      [args.peerId, String(outcome.result.toStateSeq), new Date().toISOString()]);
    }
    return outcome;
  });
}
