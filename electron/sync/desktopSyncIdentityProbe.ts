import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { readReadySyncIdentityGlobalPage,
  readReadySyncIdentityInventory } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import { readReadySyncIdentityWatermark } from '../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { diffSyncIdentityGlobalPages, type SyncIdentityGlobalPage,
  type SyncIdentityInventory } from '../../lib/core/sync/syncIdentityPagedDiff.js';
import { isSyncIdentitySourceEpoch } from '../../lib/core/sync/syncIdentitySourceEpoch.js';
import { createSyncIdentitySourceView } from '../database/syncIdentitySourceView.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { stageDesktopSyncIdentityFactCandidates } from './desktopSyncIdentityFactProbe.js';
import { excludeDesktopSyncIdentitySatisfiedFacts } from './desktopSyncIdentitySemanticProof.js';

interface ProbeArgs {
  endpointUrl: string;
  groupId: string;
  localDatabase: Database.Database;
  localDeviceId: string;
  outputRoot: string;
  secret: string;
}

interface RemoteSummary {
  contract: string;
  inventory: SyncIdentityInventory;
  source_epoch: string;
  source_view_id: string;
  watermark: string;
}

interface RemotePage extends SyncIdentityGlobalPage {
  contract: string;
  source_view_id: string;
}

function remotePagePath(viewId: string,
  after: SyncIdentityGlobalPage['nextAfter']) {
  const query = new URLSearchParams({ source_view_id: viewId });
  if (after) {
    query.set('after_type', after.object_type);
    query.set('after_id', after.object_id);
  }
  return `/companion/sync-identity-global-page?${query}`;
}

async function fetchRemotePage(args: ProbeArgs, remote: RemoteSummary,
  after: SyncIdentityGlobalPage['nextAfter']) {
  const page = await fetchDesktopWorkgroupJson<RemotePage>({
    ...args, pathWithQuery: remotePagePath(remote.source_view_id, after)
  });
  if (page.contract !== 'global-id-v2' ||
      page.source_view_id !== remote.source_view_id) {
    throw new Error('sync_identity_remote_page_changed');
  }
  return page;
}

async function fetchRemoteSummary(args: ProbeArgs) {
  const remote = await fetchDesktopWorkgroupJson<RemoteSummary>({
    ...args, pathWithQuery: '/companion/sync-identity-global-summary'
  });
  if (remote.contract !== 'global-id-v2' || !isSyncIdentitySourceEpoch(remote.source_epoch) ||
      typeof remote.watermark !== 'string' || remote.watermark.length > 128 ||
      !/^[a-f0-9-]{36}$/u.test(remote.source_view_id)) {
    throw new Error('sync_identity_remote_contract_invalid');
  }
  return remote;
}

export function openCandidateDb(filePath: string) {
  const db = new Database(filePath);
  db.exec(`CREATE TABLE candidates (
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, partition INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('source_only', 'receiver_only', 'divergent')),
    source_fingerprint TEXT, receiver_fingerprint TEXT,
    PRIMARY KEY (object_type, object_id)
  ); BEGIN`);
  return db;
}

async function stageFullCandidates(candidateDb: Database.Database,
  localPort: Awaited<ReturnType<typeof createSyncIdentitySourceView>>['port'],
  localInventory: SyncIdentityInventory, remote: RemoteSummary,
  readRemote: (after: SyncIdentityGlobalPage['nextAfter']) => Promise<RemotePage>) {
  const insert = candidateDb.prepare(`INSERT INTO candidates
    (object_type, object_id, partition, kind, source_fingerprint, receiver_fingerprint)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for await (const candidate of diffSyncIdentityGlobalPages(remote.inventory, localInventory,
    readRemote, (after) => readReadySyncIdentityGlobalPage(localPort, after))) {
    const identity = candidate.kind === 'receiver_only' ? candidate.receiver : candidate.source;
    insert.run(identity.object_type, identity.object_id, -1, candidate.kind,
      'source' in candidate ? candidate.source.fingerprint : null,
      'receiver' in candidate ? candidate.receiver.fingerprint : null);
  }
}

export async function probeDesktopSyncIdentities(args: ProbeArgs) {
  await fs.mkdir(args.outputRoot, { recursive: true });
  const staging = await fs.mkdtemp(path.toNamespacedPath(path.join(args.outputRoot, '.identity-probe-')));
  let local: Awaited<ReturnType<typeof createSyncIdentitySourceView>> | undefined;
  let candidateDb: Database.Database | undefined;
  try {
    local = await createSyncIdentitySourceView(args.localDatabase, path.join(staging, 'local.db'));
    const remote = await fetchRemoteSummary(args);
    const localInventory = await readReadySyncIdentityInventory(local.port);
    const localWatermark = await readReadySyncIdentityWatermark(local.port);
    const localPort = local.port;
    const readRemote = (after: SyncIdentityGlobalPage['nextAfter']) =>
      fetchRemotePage(args, remote, after);
    candidateDb = openCandidateDb(path.join(staging, 'candidates.db'));
    const usedTimeCandidates = false;
    await stageFullCandidates(candidateDb, localPort, localInventory, remote, readRemote);
    const roots = await stageDesktopSyncIdentityFactCandidates({ candidateDb,
      endpointUrl: args.endpointUrl, groupId: args.groupId,
      localDeviceId: args.localDeviceId, localPort, remoteViewId: remote.source_view_id,
      secret: args.secret, factBaseline: null });
    candidateDb.exec('COMMIT');
    await excludeDesktopSyncIdentitySatisfiedFacts({ candidateDb,
      endpointUrl: args.endpointUrl, groupId: args.groupId,
      localDeviceId: args.localDeviceId, localViewPath: path.join(staging, 'local.db'),
      peerViewId: remote.source_view_id, secret: args.secret });
    const count = (candidateDb.prepare('SELECT COUNT(*) AS count FROM candidates').get() as
      { count: number }).count;
    candidateDb.close();
    candidateDb = undefined;
    const localViewId = local.sourceViewId;
    const localEpoch = local.sourceEpoch;
    local.close();
    local = undefined;
    return { candidatePath: path.join(staging, 'candidates.db'), count, usedTimeCandidates,
      ...roots,
      localViewId, localEpoch, localWatermark,
      localViewPath: path.join(staging, 'local.db'),
      sourceViewId: remote.source_view_id, sourceEpoch: remote.source_epoch,
      sourceWatermark: remote.watermark,
      cleanup: () => fs.rm(staging, { recursive: true, force: true }) };
  } catch (error) {
    if (candidateDb?.inTransaction) candidateDb.exec('ROLLBACK');
    candidateDb?.close();
    local?.close();
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
