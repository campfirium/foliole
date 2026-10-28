import type { SchedulerCard } from '../review/types.js';

import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowCommitArgs, DailyFlowLearningSnapshot, DailyFlowSnapshot } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';

export type CycleStored = { day_key: string; revision: number; settings_key: string; mode: string;
  session_json: string; invalidated: number; session: DailyFlowSession };
export type CycleSaveArgs = { dayKey: string; mode: string; settingsKey: string;
  now: string; revision: number; session: DailyFlowSession };
export type DailyFlowOperation = { input_hash: string; revision: number; card_json: string | null;
  source_session_json: string | null };

// One caller-owned transaction supplies only the operations used by the daily service.
export interface DailyFlowStore {
  readState(): Promise<CycleStored | null>;
  readRows(ids?: readonly string[]): Promise<CycleRow[]>;
  scanRows(after: number, through: number, count: number): Promise<CycleRow[]>;
  writeRows(rows: CycleRow[]): Promise<void>;
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
