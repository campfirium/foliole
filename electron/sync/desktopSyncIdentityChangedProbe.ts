import type Database from 'better-sqlite3';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readReadySyncIdentityChangedPage,
  validateSyncIdentityChangedRemotePage,
  type SyncIdentityChangedCursor, type SyncIdentityChangedEntry,
  type SyncIdentityChangedRemotePage } from '../../lib/core/sync/syncIdentityChangedPage.js';
import { diffSyncIdentitySummaries,
  type SyncIdentityPageReader, type SyncIdentitySummaryRow } from '../../lib/core/sync/syncIdentityDiff.js';
import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { readReadySyncIdentityPage } from '../../lib/core/sync/syncIdentityIndexMaintenance.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';

interface StageArgs {
  candidateDb: Database.Database;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  localPort: DbPort;
  localSummary: SyncIdentitySummaryRow[];
  peerSummary: SyncIdentitySummaryRow[];
  peerViewId: string;
  localWatermark: string;
  peerWatermark: string;
  secret: string;
  readPeer: SyncIdentityPageReader;
}

async function readPeerChanged(args: StageArgs, after: SyncIdentityChangedCursor | null) {
  const query = new URLSearchParams({ source_view_id: args.peerViewId,
    since: args.peerWatermark });
  if (after) {
    query.set('after_updated_at', after.updated_at);
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  const page = await fetchDesktopWorkgroupJson<SyncIdentityChangedRemotePage>({
    ...args, pathWithQuery: `/companion/sync-identity-changed-page?${query}`
  });
  validateSyncIdentityChangedRemotePage(page, args.peerViewId, after);
  return page;
}

async function collectChangedKeys(args: StageArgs) {
  const db = args.candidateDb;
  db.exec(`CREATE TABLE changed_keys (object_type TEXT NOT NULL, object_id TEXT NOT NULL,
    partition INTEGER NOT NULL, PRIMARY KEY (object_type, object_id))`);
  const insert = db.prepare('INSERT OR IGNORE INTO changed_keys VALUES (?, ?, ?)');
  for (const side of ['peer', 'local'] as const) {
    let after: SyncIdentityChangedCursor | null = null;
    for (;;) {
      const page: { entries: SyncIdentityChangedEntry[]; nextAfter: SyncIdentityChangedCursor | null } =
        side === 'peer' ? await readPeerChanged(args, after) :
        await readReadySyncIdentityChangedPage(args.localPort, args.localWatermark, after);
      for (const entry of page.entries) {
        const partition = syncIdentityPartition(entry.object_type, entry.object_id);
        if (args.peerSummary[partition]?.digest !== args.localSummary[partition]?.digest) {
          insert.run(entry.object_type, entry.object_id, partition);
        }
      }
      if (!page.nextAfter) break;
      after = page.nextAfter;
    }
  }
}

/** Time narrows candidate partitions; the caller must still run a complete post-exchange probe. */
export async function stageDesktopSyncIdentityChangedCandidates(args: StageArgs) {
  await collectChangedKeys(args);
  const selected = new Set((args.candidateDb.prepare('SELECT DISTINCT partition FROM changed_keys').all() as
    Array<{ partition: number }>).map((row) => row.partition));
  const maskedPeer = args.peerSummary.map((row, index) =>
    selected.has(index) ? row : args.localSummary[index]!);
  const hasKey = args.candidateDb.prepare(`SELECT 1 FROM changed_keys
    WHERE object_type = ? AND object_id = ?`);
  const insert = args.candidateDb.prepare(`INSERT INTO candidates
    (object_type, object_id, partition, kind, source_fingerprint, receiver_fingerprint)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for await (const candidate of diffSyncIdentitySummaries(maskedPeer, args.localSummary,
    args.readPeer, (partition, after) =>
      readReadySyncIdentityPage(args.localPort, partition, after))) {
    const identity = candidate.kind === 'receiver_only' ? candidate.receiver : candidate.source;
    if (!hasKey.get(identity.object_type, identity.object_id)) continue;
    insert.run(identity.object_type, identity.object_id, candidate.partition, candidate.kind,
      'source' in candidate ? candidate.source.fingerprint : null,
      'receiver' in candidate ? candidate.receiver.fingerprint : null);
  }
  args.candidateDb.exec('DROP TABLE changed_keys');
}
