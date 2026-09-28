import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { SYNC_PACK_DATABASE_ENTRY } from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { describeVersionFact, selectMissingSyncPackFacts, type SyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { writeStoredZipFromFile } from '../diagnostics/zipStore.js';

import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { loadDesktopSyncGroupRestoreState } from './syncGroupRestoreState.js';
import { writePackManifest, writePackRows } from './syncPackBuilderRows.js';
import { buildContainerManifest } from './syncPackContainerManifest.js';
import { deflateSyncPackDatabase } from './syncPackFileCompression.js';
import { loadSyncPackGroupRows } from './syncPackGroupRows.js';
import type { LoadedDesktopSyncPackRows } from './syncPackLoadedRows.js';
import { stageDesktopSyncPackNodeHolds } from './syncPackNodeVersionHolds.js';
import {
  loadSyncPackNodeVersionParentRows,
  loadSyncPackNodeVersionRows
} from './syncPackNodeVersionRows.js';
import { measureSyncPackPage, syncPackPageFits, type SyncPackPageBudget } from './syncPackPageBudget.js';
import { assertSyncPackPreloadBudget } from './syncPackPreloadBudget.js';
import { loadPackRows } from './syncPackRows.js';
import { loadSyncPackTombstoneRows } from './syncPackTombstoneRows.js';
import { assertSyncPackVersionBudget } from './syncPackVersionPreflight.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export interface BuildDesktopSyncPackInput {
  createdAt?: string;
  frontierStateSeq?: number;
  fromPeerId: string;
  outputPath: string;
  packId: string;
  fromStateSeq: number;
  toPeerId?: string;
  toStateSeq?: number;
  requireDeliveryHold?: boolean;
  restoreId?: string;
  sourceEpoch?: string;
  pageBudget?: SyncPackPageBudget;
  receiverFacts?: SyncPackFactClaims;
}

function normalizeSeq(value: number) {
  return Math.max(0, Math.trunc(value));
}

export async function buildDesktopSyncPackFromDriver(
  input: BuildDesktopSyncPackInput,
  sourceDriver: DatabaseDriver
) {
  const fromStateSeq = normalizeSeq(input.fromStateSeq);
  const createdAt = input.createdAt ?? new Date().toISOString();
  backfillMissingNodeSyncState(sourceDriver, !input.pageBudget);
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.rm(input.outputPath, { force: true });
  const incomingPath = `${input.outputPath}.incoming.db`;
  const compressedPath = `${input.outputPath}.incoming.db.deflate`;
  await fs.rm(incomingPath, { force: true });
  await fs.rm(compressedPath, { force: true });
  const packDb = new BetterSqlite3(incomingPath);
  try {
    for (const statement of PACK_SCHEMA) packDb.exec(statement);
    const { frontierStateSeq, rows, sourceEpoch, packToStateSeq } = sourceDriver.transaction((tx) =>
      loadSourceRows(tx, input, fromStateSeq));
    const writePack = packDb.transaction(() => {
      writePackManifest(packDb, { ...input, frontierStateSeq, sourceEpoch }, fromStateSeq, packToStateSeq, rows);
      writePackRows(packDb, rows);
    });
    writePack();
    const fileChecksums = await deflateSyncPackDatabase(incomingPath, compressedPath);
    const containerManifest = buildContainerManifest({
      compressedSha256: fileChecksums.compressed.sha256, createdAt,
      fromPeerId: input.fromPeerId, frontierStateSeq, fromStateSeq, input, rows,
      sourceEpoch, toStateSeq: packToStateSeq,
      uncompressedSha256: fileChecksums.raw.sha256
    });
    await writeStoredZipFromFile({
      bodyFilePath: compressedPath, bodyName: SYNC_PACK_DATABASE_ENTRY,
      filePath: input.outputPath,
      manifest: Buffer.from(JSON.stringify(containerManifest, null, 2), 'utf8')
    });
    const measured = await measureAndHoldPage(input, sourceDriver, rows, incomingPath, createdAt);
    return {
      outputPath: input.outputPath,
      packId: input.packId,
      fromStateSeq,
      frontierStateSeq,
      sourceEpoch,
      toStateSeq: packToStateSeq,
      objectCount: rows.stateRows.length,
      bodyBlobCount: rows.contentBlobs.length,
      measured,
      manifest: containerManifest
    };
  } catch (error) {
    await fs.rm(input.outputPath, { force: true });
    throw error;
  } finally {
    packDb.close();
    await fs.rm(incomingPath, { force: true });
    await fs.rm(compressedPath, { force: true });
  }
}

async function measureAndHoldPage(input: BuildDesktopSyncPackInput, sourceDriver: DatabaseDriver,
  rows: LoadedDesktopSyncPackRows, databasePath: string, createdAt: string) {
  const measured = await measureSyncPackPage({ archivePath: input.outputPath, databasePath, rows });
  if (input.pageBudget && !syncPackPageFits(measured, input.pageBudget)) {
    throw new Error('sync_pack_page_changed_during_build');
  }
  if (input.requireDeliveryHold) {
    if (!input.toPeerId) throw new Error('node_version_pack_target_missing');
    sourceDriver.transaction((tx) => stageDesktopSyncPackNodeHolds({
      createdAt, driver: tx, fromPeerId: input.fromPeerId, nodes: rows.nodes,
      packId: input.packId, toPeerId: input.toPeerId!, versions: rows.nodeVersions,
      knownVersionIds: input.receiverFacts?.versions ?? []
    }));
  }
  return measured;
}

function loadSourceRows(
  driver: DatabaseDriver,
  input: BuildDesktopSyncPackInput,
  fromStateSeq: number
) {
  if (input.restoreId) {
    const groupId = driver.queryOne<{ group_id: string }>(`SELECT group_id FROM sync_group_local_state
      WHERE singleton_id = 1 AND state = 'active'`)?.group_id;
    const restore = groupId ? loadDesktopSyncGroupRestoreState(driver, groupId) : null;
    if (!restore?.applied || restore.event.restore_id !== input.restoreId) {
      throw new Error('sync_group_restore_source_changed');
    }
  }
  const source = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1'
  );
  if (!source?.source_epoch) throw new Error('sync_pack_source_epoch_missing');
  if (input.sourceEpoch && input.sourceEpoch !== source.source_epoch) {
    throw new Error('sync_pack_source_epoch_changed');
  }
  const frontierStateSeq = normalizeSeq(input.frontierStateSeq ?? source.high_water);
  if (frontierStateSeq > source.high_water) throw new Error('sync_pack_frontier_unavailable');
  const toStateSeq = normalizeSeq(input.toStateSeq ?? frontierStateSeq);
  if (toStateSeq > frontierStateSeq) throw new Error('sync_pack_page_exceeds_frontier');
  if (input.pageBudget) {
    assertSyncPackPreloadBudget(driver, fromStateSeq, toStateSeq, input.pageBudget, input.receiverFacts);
  }
  const baseRows = loadPackRows(fromStateSeq, toStateSeq, driver);
  if (input.pageBudget) assertSyncPackVersionBudget(driver, baseRows.nodes, input.pageBudget,
    input.receiverFacts?.versions);
  const groupRows = loadSyncPackGroupRows(driver);
  const nodeVersions = loadSyncPackNodeVersionRows(driver, baseRows.nodes);
  const selectedFacts = selectMissingSyncPackFacts({
    versions: nodeVersions,
    parents: loadSyncPackNodeVersionParentRows(driver, nodeVersions),
    reviews: baseRows.reviewLog
  }, input.receiverFacts ?? { versions: [], parents: [], reviews: [] });
  for (const version of selectedFacts.versions) {
    if (describeVersionFact(version).body_hash === null) {
      throw new Error(`sync_pack_fact_body_unavailable:${version.version_id}`);
    }
  }
  const rows: LoadedDesktopSyncPackRows = {
    ...baseRows,
    reviewLog: selectedFacts.reviews,
    groupDevices: groupRows.devices,
    groups: groupRows.groups,
    nodeVersions: selectedFacts.versions,
    nodeTombstones: loadSyncPackTombstoneRows(driver, input.pageBudget
      ? { fromStateSeq, toStateSeq } : undefined),
    nodeVersionParents: selectedFacts.parents
  };
  return { frontierStateSeq, rows, sourceEpoch: source.source_epoch,
    packToStateSeq: baseRows.consumedStateSeq };
}
