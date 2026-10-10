import { loadForegroundBaseline, loadForegroundSourceWithDbPort } from '../../../../../lib/core/database/foregroundTimeSource';
import { saveForegroundTime } from '../../../../../lib/core/database/foregroundTimeStore';
import { ForegroundTimeRecording } from '../../../../../lib/core/review/foregroundTimeRecording';
import { loadSyncGroupOverwriteProgress } from '../../../../../lib/core/sync/syncGroupOverwriteProgress';
import { getCurrentReviewSchedulerSettings, subscribeReviewDayBoundary } from '../../../../features/settings/model/reviewSchedulerSettings';
import { readNativeAppActiveState, subscribeNativeAppBackground, subscribeNativeAppForeground } from '../../appLifecycle';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

type ForegroundTimeOwner = Pick<CapacitorCompanionDatabaseOwner, 'runWriter' | 'foregroundTimeOwnerId'>;

interface Recording {
  owner: ForegroundTimeOwner;
  counter: ForegroundTimeRecording;
  active: boolean;
  timer: ReturnType<typeof setInterval> | null;
  unsubscribes: (() => void)[];
  tail: Promise<void>;
}
let recording: Recording | null = null;
let lastFailure: unknown = null;

export function companionForegroundTimeSnapshot() {
  return recording?.counter.snapshot();
}

export function companionForegroundTimeFailure() { return lastFailure; }

function hour() { return getCurrentReviewSchedulerSettings().newDayStartsAtHour; }

function persist(state: Recording) {
  if (state.counter.maintaining) return state.tail;
  state.counter.setActive(state.active, hour());
  return persistSnapshot(state, { sourceId: state.counter.sourceId, buckets: state.counter.checkpoint() });
}

function persistSnapshot(state: Recording, snapshot: ReturnType<ForegroundTimeRecording['snapshot']>) {
  const request = state.tail.then(() => state.owner.runWriter((db) => saveForegroundTime(db, {
    ...snapshot, hash: iosCompanionContentHash,
    mark: async (tx, record) => markIosCompanionMutation({ db: tx,
      hostName: await iosCompanionHostName(tx), objectType: 'foreground_daily_time',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt })
  })));
  state.tail = request.then(() => { lastFailure = null; }, (error: unknown) => { lastFailure = error; });
  return request;
}

function setActive(state: Recording, active: boolean) {
  if (recording !== state) return;
  state.active = active;
  state.counter.setActive(active, hour());
  if (active && !state.timer) state.timer = setInterval(() => { void persist(state).catch(() => undefined); }, 60_000);
  if (!active) {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    void persist(state).catch(() => undefined);
  }
}

export async function startCompanionForegroundTime(owner: ForegroundTimeOwner) {
  if (recording?.owner === owner) return;
  await stopCompanionForegroundTime();
  const ownerId = await owner.foregroundTimeOwnerId();
  const source = await owner.runWriter(async (db) => {
    const sourceId = await loadForegroundSourceWithDbPort(db, ownerId);
    return { sourceId, baseline: await loadForegroundBaseline(db, sourceId), pending: await loadSyncGroupOverwriteProgress(db) };
  });
  const state: Recording = { owner,
    counter: new ForegroundTimeRecording(() => ({ wallMs: Date.now(), monotonicMs: performance.now() }), source.sourceId, source.baseline),
    active: false, timer: null, unsubscribes: [], tail: Promise.resolve() };
  recording = state;
  if (source.pending) state.counter.beginMaintenance();
  try {
    state.unsubscribes.push(subscribeReviewDayBoundary((newHour) => {
      state.counter.setActive(state.active, newHour);
      void persist(state).catch(() => undefined);
    }));
    state.unsubscribes.push(await subscribeNativeAppForeground(() => setActive(state, true)));
    state.unsubscribes.push(await subscribeNativeAppBackground(() => setActive(state, false)));
    setActive(state, await readNativeAppActiveState());
  } catch (error) {
    try { await stopCompanionForegroundTime(); } finally { lastFailure = error; }
    throw error;
  }
}

export async function flushCompanionForegroundTime() {
  if (recording) await persist(recording);
}

export async function stopCompanionForegroundTime() {
  const state = recording;
  if (!state) return;
  for (const unsubscribe of state.unsubscribes) unsubscribe();
  if (state.timer) clearInterval(state.timer);
  state.active = false;
  state.counter.setActive(false, hour());
  await persist(state);
  recording = null;
}

export async function withCompanionForegroundTimeMaintenance<T>(task: () => Promise<T>,
  canFinish: () => Promise<boolean> = async () => true) {
  const state = recording;
  if (!state) return task();
  if (!state.counter.maintaining) {
    const snapshot = state.counter.beginMaintenance();
    try { await persistSnapshot(state, snapshot); }
    catch (error) { state.counter.cancelMaintenance(); throw error; }
  }
  let failed = false;
  try { return await task(); }
  catch (error) { failed = true; throw error; }
  finally { await finishAfterTask(state, canFinish, failed); }
}

async function finishAfterTask(state: Recording, canFinish: () => Promise<boolean>, failed: boolean) {
  try { if (await canFinish()) await finishMaintenance(state); }
  catch (error) {
    lastFailure = error;
    if (!failed) throw error;
  }
}

async function finishMaintenance(state: Recording) {
  const ownerId = await state.owner.foregroundTimeOwnerId();
  const source = await state.owner.runWriter(async (db) => {
    const sourceId = await loadForegroundSourceWithDbPort(db, ownerId);
    return { sourceId, baseline: await loadForegroundBaseline(db, sourceId) };
  });
  state.counter.finishMaintenance(source.sourceId, source.baseline);
  await persist(state);
}
