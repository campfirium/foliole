import type Database from 'better-sqlite3';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readSyncIdentityNodeFactGlobalPage, readSyncIdentityNodeFactInventory } from '../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';
import { readSyncIdentityNodeFactProofRoot } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { diffSyncIdentityGlobalPages, type SyncIdentityInventory } from '../../lib/core/sync/syncIdentityPagedDiff.js';
import { canReuseSyncIdentityFactProof } from '../../lib/core/sync/syncIdentityPeerBaseline.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';

interface FactEntry {
  fingerprint: string;
  object_id: string;
  object_type: 'node';
  state_fingerprint: string;
}

interface RemoteFactSummary {
  contract: string;
  inventory: SyncIdentityInventory;
  proof_root: string;
  source_view_id: string;
}

interface RemoteFactPage {
  contract: string;
  entries: FactEntry[];
  nextAfter: { object_type: string; object_id: string } | null;
  source_view_id: string;
}

function factPagePath(viewId: string,
  after: { object_type: string; object_id: string } | null) {
  const query = new URLSearchParams({ source_view_id: viewId });
  if (after) {
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  return `/companion/sync-identity-fact-global-page?${query}`;
}

export async function stageDesktopSyncIdentityFactCandidates(args: {
  candidateDb: Database.Database;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  localPort: DbPort;
  remoteViewId: string;
  secret: string;
  factBaseline?: { localProofRoot: string; peerProofRoot: string;
    proofRevision: string } | null;
}) {
  const remote = await fetchDesktopWorkgroupJson<RemoteFactSummary>({
    ...args, pathWithQuery: '/companion/sync-identity-fact-summary?' +
      new URLSearchParams({ source_view_id: args.remoteViewId })
  });
  if (remote.contract !== 'global-id-v2' || remote.source_view_id !== args.remoteViewId ||
      !/^[a-f0-9]{64}$/u.test(remote.proof_root)) {
    throw new Error('sync_identity_remote_fact_view_changed');
  }
  const roots = { localProofRoot: await readSyncIdentityNodeFactProofRoot(args.localPort),
    peerProofRoot: remote.proof_root };
  if (canReuseSyncIdentityFactProof(args.factBaseline, roots)) return roots;
  const localSummary = await readSyncIdentityNodeFactInventory(args.localPort);
  const readRemote = async (after: { object_type: string; object_id: string } | null) => {
    const page = await fetchDesktopWorkgroupJson<RemoteFactPage>({
      ...args, pathWithQuery: factPagePath(remote.source_view_id, after)
    });
    if (page.contract !== 'global-id-v2' ||
        page.source_view_id !== remote.source_view_id || page.entries.some((entry) =>
          entry.object_type !== 'node' || !/^[a-f0-9]{64}$/u.test(entry.state_fingerprint))) {
      throw new Error('sync_identity_remote_fact_page_invalid');
    }
    return page;
  };
  const insert = args.candidateDb.prepare(`INSERT INTO candidates
    (object_type, object_id, partition, kind, source_fingerprint, receiver_fingerprint)
    VALUES ('node', ?, ?, ?, ?, ?) ON CONFLICT(object_type, object_id) DO NOTHING`);
  for await (const candidate of diffSyncIdentityGlobalPages(remote.inventory, localSummary,
    readRemote, (after) => readSyncIdentityNodeFactGlobalPage(args.localPort, after),
    (left, right) => left.repair_required === true || right.repair_required === true)) {
    const source = 'source' in candidate ? candidate.source as FactEntry : null;
    const receiver = 'receiver' in candidate ? candidate.receiver as FactEntry : null;
    insert.run(source?.object_id ?? receiver!.object_id, -1, candidate.kind,
      source?.state_fingerprint ?? null, receiver?.state_fingerprint ?? null);
  }
  return roots;
}
