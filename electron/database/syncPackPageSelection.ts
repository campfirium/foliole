import { promises as fs } from 'node:fs';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { buildDesktopSyncPackFromDriver, type BuildDesktopSyncPackInput } from './syncPackBuilderFromDriver.js';
import { syncPackPageFits, type SyncPackPageBudget } from './syncPackPageBudget.js';
import { backfillMissingTombstoneSyncState } from './syncPackTombstoneStateBackfill.js';

function assertBudget(budget: SyncPackPageBudget) {
  if (Object.values(budget).some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('sync_pack_page_budget_invalid');
  }
}

export async function buildNextDesktopSyncPackPage(
  input: BuildDesktopSyncPackInput,
  budget: SyncPackPageBudget,
  sourceDriver: DatabaseDriver
) {
  assertBudget(budget);
  if (input.toStateSeq !== undefined) throw new Error('sync_pack_page_to_set_by_caller');
  backfillMissingNodeSyncState(sourceDriver, false);
  backfillMissingTombstoneSyncState(sourceDriver);
  const source = sourceDriver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1'
  );
  if (!source?.source_epoch) throw new Error('sync_pack_source_epoch_missing');
  const frontier = input.frontierStateSeq ?? source.high_water;
  if (!Number.isSafeInteger(frontier) || frontier < input.fromStateSeq || frontier > source.high_water) {
    throw new Error('sync_pack_frontier_unavailable');
  }
  if (input.sourceEpoch && input.sourceEpoch !== source.source_epoch) {
    throw new Error('sync_pack_source_epoch_changed');
  }
  const states = sourceDriver.queryAll<{ state_seq: number }>(
    `SELECT DISTINCT state_seq FROM sync_object_state
     WHERE state_seq > ? AND state_seq <= ? ORDER BY state_seq LIMIT ?`,
    [input.fromStateSeq, frontier, budget.applyRows]
  );
  const candidates = states.map((row) => row.state_seq);
  if (candidates.length < budget.applyRows && candidates.at(-1) !== frontier) candidates.push(frontier);
  if (!candidates.length) candidates.push(frontier);
  const trialPath = `${input.outputPath}.trial`;
  const trial = async (toStateSeq: number) => {
    try {
      const page = await buildDesktopSyncPackFromDriver({ ...input,
        frontierStateSeq: frontier, outputPath: trialPath, requireDeliveryHold: false,
        sourceEpoch: source.source_epoch, toStateSeq, pageBudget: budget
      }, sourceDriver);
      return syncPackPageFits(page.measured, budget);
    } catch (error) {
      if (error instanceof Error && ['sync_pack_page_preflight_exceeds_budget',
        'sync_pack_page_changed_during_build'].includes(error.message)) {
        return false;
      }
      throw error;
    } finally {
      await fs.rm(trialPath, { force: true });
    }
  };
  const acceptedIndex = await findFittingCandidate(candidates, trial, input.fromStateSeq);
  const selected = await buildDesktopSyncPackFromDriver({ ...input,
    frontierStateSeq: frontier, sourceEpoch: source.source_epoch,
    toStateSeq: candidates[acceptedIndex]!, pageBudget: budget
  }, sourceDriver);
  return selected;
}

async function findFittingCandidate(candidates: number[], trial: (seq: number) => Promise<boolean>,
  fromStateSeq: number) {
  let acceptedIndex = -1;
  let probe = Math.min(32, candidates.length) - 1;
  while (probe < candidates.length) {
    if (await trial(candidates[probe]!)) {
      acceptedIndex = probe;
      if (probe === candidates.length - 1) break;
      probe = Math.min(candidates.length, (probe + 1) * 2) - 1;
    } else if (acceptedIndex >= 0) {
      break;
    } else if (probe > 0) {
      probe = Math.floor(probe / 2);
    } else {
      const staticFits = await trial(fromStateSeq);
      throw new Error(staticFits ? 'sync_pack_object_requires_fragments'
        : 'sync_pack_static_dependencies_over_budget');
    }
  }
  return acceptedIndex;
}
