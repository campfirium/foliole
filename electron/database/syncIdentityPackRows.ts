import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { nodeVersionDependenciesSql, type NodeVersionDependency } from '../../lib/core/sync/nodeVersionDependencies.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';
import type { SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import {
  describeVersionFact, selectMissingSyncPackFacts, type SyncPackFactClaims
} from '../../lib/core/sync/syncPackFactPresence.js';

import { loadSyncPackGroupRows } from './syncPackGroupRows.js';
import type { WritableDesktopSyncPackRows } from './syncPackLoadedRows.js';
import { loadSyncPackNodeVersionParentRows,
  iterateSyncPackNodeVersionRows } from './syncPackNodeVersionRows.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET, type SyncPackPageBudget } from './syncPackPageBudget.js';
import type { ReviewLogPackRow } from './syncPackRows.js';
import { loadPackRowsByIdentity } from './syncPackRowsByIdentity.js';
import { loadSyncPackTombstoneRowsByIds } from './syncPackTombstoneRows.js';
import { syncPackVersionHeads } from './syncPackVersionHeads.js';

const EMPTY_CLAIMS: SyncPackFactClaims = { versions: [], parents: [], reviews: [] };

/** Reads current objects and retained facts for one verified global-ID page. */
export function loadSyncIdentityPackRows(driver: DatabaseDriver, page: SyncIdentityPackPage,
  claims: SyncPackFactClaims = EMPTY_CLAIMS,
  budget: SyncPackPageBudget = DEFAULT_SYNC_PACK_PAGE_BUDGET): WritableDesktopSyncPackRows {
  const base = loadPackRowsByIdentity(driver, page.objects);
  const selectedNodeIds = base.stateRows.filter((row) => row.object_type === 'node')
    .map((row) => row.object_id);
  const deletedNodeIds = base.stateRows.filter((row) => row.object_type === 'node' &&
    row.deleted_at !== null).map((row) => row.object_id);
  const tombstones = loadSyncPackTombstoneRowsByIds(driver, deletedNodeIds);
  assertOriginalTombstoneVersions(driver, tombstones);
  const heads = syncPackVersionHeads(driver, base.nodes, tombstones);
  if (page.facts?.section === 'head' || page.objects.every((object) =>
    compareSyncIdentityText(object.object_type, 'node') > 0)) return loadHeadRows(driver, base, tombstones);
  assertPageBudget(driver, heads.map((head) => head.id), selectedNodeIds, claims,
    base.stateRows.length, budget);
  const identities: { version_id: string; object_id: string }[] = [];
  const nodeReviews = selectedNodeIds.length ? driver.queryAll<ReviewLogPackRow>(
    `SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
      due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     FROM review_log WHERE node_id IN (SELECT value FROM json_each(?))
     ORDER BY reviewed_at, op_id`, [JSON.stringify(selectedNodeIds)]) : [];
  const reviews = [...new Map([...base.reviewLog, ...nodeReviews].map((row) =>
    [row.op_id, row])).values()].sort((left, right) =>
    left.reviewed_at.localeCompare(right.reviewed_at) || left.op_id.localeCompare(right.op_id));
  const facts = selectMissingSyncPackFacts({
    versions: [...iterateSyncPackNodeVersionRows(driver, heads,
      claims.versions, (row) => identities.push(row))],
    parents: loadSyncPackNodeVersionParentRows(driver, identities),
    reviews
  }, claims);
  const currentVersionIds = new Set(heads.map((head) => head.current_version_id));
  for (const version of facts.versions) {
    if (currentVersionIds.has(version.version_id) && describeVersionFact(version).body_hash === null) {
      throw new Error(`sync_pack_fact_body_unavailable:${version.version_id}`);
    }
  }
  const group = loadSyncPackGroupRows(driver);
  return {
    ...base,
    stateRows: base.stateRows.map((row) => ({ ...row, state_seq: 0 })),
    nodeVersionDependencies: driver.queryAll<NodeVersionDependency>(nodeVersionDependenciesSql('main',
      `(SELECT value AS id FROM json_each(?))`), [JSON.stringify(heads.map((head) => head.id))]),
    groupDevices: group.devices,
    groups: group.groups,
    nodeVersions: facts.versions,
    nodeTombstones: tombstones,
    nodeVersionParents: facts.parents,
    reviewLog: facts.reviews
  };
}

function assertPageBudget(driver: DatabaseDriver, headNodeIds: string[], selectedNodeIds: string[],
  claims: SyncPackFactClaims, stateRows: number, budget: SyncPackPageBudget) {
  const [preflight] = driver.queryAll<{ rows: number; bytes: number }>(
    `SELECT COUNT(*) AS rows, COALESCE(SUM(length(CAST(snapshot_json AS BLOB)) +
      COALESCE(length(CAST(body_text AS BLOB)), 0)), 0) AS bytes
     FROM node_sync_versions WHERE object_id IN (SELECT value FROM json_each(?))
       AND version_id NOT IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(headNodeIds), JSON.stringify(claims.versions)]);
  const [reviews] = driver.queryAll<{ rows: number }>(`SELECT COUNT(*) AS rows
    FROM review_log WHERE node_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(selectedNodeIds)]);
  if (stateRows + (preflight?.rows ?? 0) + (reviews?.rows ?? 0) > budget.applyRows ||
      (preflight?.bytes ?? 0) > budget.databaseBytes) throw new Error('sync_identity_pack_page_over_budget');
}

function assertOriginalTombstoneVersions(driver: DatabaseDriver,
  tombstones: ReturnType<typeof loadSyncPackTombstoneRowsByIds>) {
  for (const tomb of tombstones) {
    if (!driver.queryOne('SELECT 1 FROM node_sync_versions WHERE version_id = ? AND object_id = ?',
      [tomb.version_id, tomb.node_id])) throw new Error(`sync_pack_fact_body_unavailable:${tomb.version_id}`);
  }
}

function loadHeadRows(driver: DatabaseDriver, base: ReturnType<typeof loadPackRowsByIdentity>,
  tombstones: ReturnType<typeof loadSyncPackTombstoneRowsByIds>) {
  const group = loadSyncPackGroupRows(driver);
  return { ...base, stateRows: base.stateRows.map((row) => ({ ...row, state_seq: 0 })),
    nodeVersions: [], nodeVersionParents: [], nodeVersionDependencies: [],
    nodeTombstones: tombstones, reviewLog: [], groupDevices: group.devices, groups: group.groups };
}
