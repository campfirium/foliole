import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

import { assertSyncPackPreloadBudget } from './syncPackPreloadBudget.js';
import { assertSyncPackSurfaceRowBudget } from './syncPackSurfaceRowBudget.js';

interface SourceState extends DatabaseRow {
  state_seq: number;
}

export interface DesktopSyncPackFactWindow {
  fromStateSeq: number;
  toStateSeq: number;
  frontierStateSeq: number;
  sourceEpoch: string;
}

const BATCH_STATES = 32;
const BATCH_BUDGET = {
  applyRows: 128, databaseBytes: 256 * 1024, transferBytes: 1024 * 1024
};

export function selectDesktopSyncPackFactWindow(driver: DatabaseDriver, args: {
  fromStateSeq: number; frontierStateSeq?: number; sourceEpoch?: string;
}): DesktopSyncPackFactWindow {
  const source = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
  if (!source?.source_epoch) throw new Error('sync_pack_source_epoch_missing');
  const frontier = args.frontierStateSeq ?? source.high_water;
  if (!Number.isSafeInteger(args.fromStateSeq) || args.fromStateSeq < 0 ||
      !Number.isSafeInteger(frontier) || frontier < args.fromStateSeq || frontier > source.high_water) {
    throw new Error('sync_pack_frontier_unavailable');
  }
  if (args.sourceEpoch && args.sourceEpoch !== source.source_epoch) {
    throw new Error('sync_pack_source_epoch_changed');
  }
  const states = driver.queryAll<SourceState>(`SELECT state_seq FROM sync_object_state
    WHERE state_seq > ? AND state_seq <= ? ORDER BY state_seq LIMIT ?`,
  [args.fromStateSeq, frontier, BATCH_STATES + 1]);
  const first = states[0];
  if (!first) return { fromStateSeq: args.fromStateSeq, toStateSeq: frontier,
    frontierStateSeq: frontier, sourceEpoch: source.source_epoch };
  let toStateSeq = first.state_seq;
  const candidates = states.slice(0, BATCH_STATES);
  let low = 2;
  let high = candidates.length;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = candidates[middle - 1]!.state_seq;
    if (fitsBatch(driver, args.fromStateSeq, candidate)) {
      toStateSeq = candidate;
      low = middle + 1;
    } else high = middle - 1;
  }
  return { fromStateSeq: args.fromStateSeq, toStateSeq,
    frontierStateSeq: frontier, sourceEpoch: source.source_epoch };
}

function fitsBatch(driver: DatabaseDriver, fromStateSeq: number, toStateSeq: number) {
  try {
    assertSyncPackPreloadBudget(driver, fromStateSeq, toStateSeq, BATCH_BUDGET);
    assertSyncPackSurfaceRowBudget(driver, fromStateSeq, toStateSeq, BATCH_BUDGET.applyRows);
    return true;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === 'sync_pack_page_preflight_exceeds_budget') return false;
    throw error;
  }
}
