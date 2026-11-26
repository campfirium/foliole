import type { SchedulerCard } from '../review/types.js';

import type { DirtyReconcilePlan } from './cycleFlowDirtyScope.js';
import type { CycleKind, CycleRow, CycleStoredRow } from './cycleFlowTypes.js';
import type { DailyFlowCommitArgs, DailyFlowLearningSnapshot, DailyFlowSettings, DailyFlowSnapshot } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { FlowTiming } from './flowTiming.js';

export type CycleScanFilter = { kinds: readonly CycleKind[]; nowMs: number };

export type CycleStored = { day_key: string; revision: number; settings_key: string; mode: string;
  session_json: string; invalidated: number; scope_complete?: number; session: DailyFlowSession };
export type CycleSaveArgs = { dayKey: string; mode: string; settingsKey: string;
  now: string; revision: number; session: DailyFlowSession };
/** The entries one command changed, with what the stored remaining counts held for them before it. */
export type CycleTaskCounts = { remaining: number; reviewRemaining: number };
export type CycleReconcileScope = { ids: readonly string[]; counted: CycleTaskCounts };
export type DailyFlowOperation = { input_hash: string; revision: number; card_json: string | null;
  source_session_json: string | null };

// One caller-owned transaction supplies only the operations used by the daily service.
export type PreparedFlowNavigation = { source: DailyFlowSession; next: DailyFlowSession; snapshot?: DailyFlowLearningSnapshot; valid(): boolean };

export interface DailyFlowStore {
  timing?: FlowTiming;
  readingPreservesPosition?: boolean;
  /** Set when only these entries can be out of date; otherwise a reconcile covers the whole list. */
  reconcileScope?: CycleReconcileScope;
  /** Where the store records changed nodes: how a pending reconcile may narrow, and how it marks them handled. */
  dirtyReconcile?(stored: CycleStored, settings: DailyFlowSettings): Promise<DirtyReconcilePlan>;
  completeReconcileScope?(): Promise<void>;
  preparedNavigation?: PreparedFlowNavigation | undefined;
  readState(): Promise<CycleStored | null>;
  readDiveMembers?(id: string): Promise<string[]>;
  readRows(ids?: readonly string[]): Promise<CycleRow[]>;
  /** Rows in order; with a filter, rows known to be hidden by the mode or still waiting are left in the table. */
  /** `nodeIds` limits the scan to those entries before any row reaches the caller. */
  scanRows(after: number, through: number, count: number, filter?: CycleScanFilter,
    nodeIds?: readonly string[]): Promise<CycleStoredRow[]>;
  /** Waiting rows whose time has come, earliest first. */
  timedRows?(filter: CycleScanFilter, count: number, nodeIds?: readonly string[]): Promise<CycleStoredRow[]>;
  readReadiness?(ids?: readonly string[]): Promise<CycleStoredRow[]>;
  writeRows(rows: CycleStoredRow[]): Promise<void>;
  deleteRows(ids: readonly string[]): Promise<void>;
  resetCycle(): Promise<void>;
  saveState(args: CycleSaveArgs): Promise<DailyFlowSession>;
  readOperation(id: string): Promise<DailyFlowOperation | null>;
  saveOperation(id: string, value: DailyFlowOperation): Promise<void>;
  learningSnapshot(ids?: readonly string[]): Promise<DailyFlowLearningSnapshot>;
  scopedLearningSnapshot(ids: readonly (string | null | undefined)[]): Promise<DailyFlowLearningSnapshot>;
  snapshot(ids?: readonly string[]): Promise<DailyFlowSnapshot>;
  grade(args: NonNullable<DailyFlowCommitArgs['grade']>, opId: string): Promise<SchedulerCard | null>;
  reading(value: NonNullable<DailyFlowCommitArgs['readings']>[number], now: string): Promise<void>;
  reviewHistory(value: NonNullable<DailyFlowCommitArgs['reviewHistory']>, now: string): Promise<SchedulerCard | null>;
}

export function cycleStateToSave(args: CycleSaveArgs): CycleStored {
  if (!args.session.cycle) throw new Error('daily_flow_cycle_missing');
  const cycle = { ...args.session.cycle };
  const dayWindow = (JSON.parse(args.settingsKey) as { dayWindow?: { start: string; end: string } }).dayWindow ?? args.session.dayWindow;
  const session = { ...args.session, ...(dayWindow ? { dayWindow } : {}), cycle, flowFormat: 'cycle-v1' as const };
  const scope = (JSON.parse(args.settingsKey) as { scope?: string }).scope ?? '';
  return { day_key: args.dayKey, revision: args.revision, settings_key: args.settingsKey, mode: args.mode,
    session_json: JSON.stringify({ ...session, daily: undefined }), invalidated: 0,
    session: { ...session, daily: { scope, dayKey: args.dayKey, revision: args.revision } } };
}
