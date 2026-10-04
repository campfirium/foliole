import { saveForegroundTime } from '../../../../../lib/core/database/foregroundTimeStore';
import { ForegroundTimeCounter } from '../../../../../lib/core/review/foregroundTime';
import { getCurrentReviewSchedulerSettings, subscribeReviewDayBoundary } from '../../../../features/settings/model/reviewSchedulerSettings';
import { readNativeAppActiveState, subscribeNativeAppBackground, subscribeNativeAppForeground } from '../../appLifecycle';
import { createCompanionUuid } from '../../companionUuid';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

type ForegroundTimeOwner = Pick<CapacitorCompanionDatabaseOwner, 'runWriter'>;

interface Recording {
  owner: ForegroundTimeOwner;
  sourceId: string;
  counter: ForegroundTimeCounter;
  active: boolean;
  timer: ReturnType<typeof setInterval> | null;
  unsubscribes: (() => void)[];
  tail: Promise<void>;
}
let recording: Recording | null = null;
let lastFailure: unknown = null;

export function companionForegroundTimeSnapshot() {
  return recording ? { sourceId: recording.sourceId, buckets: recording.counter.snapshot() } : undefined;
}

export function companionForegroundTimeFailure() { return lastFailure; }

function hour() { return getCurrentReviewSchedulerSettings().newDayStartsAtHour; }

function persist(state: Recording) {
  state.counter.setActive(state.active, hour());
  const buckets = state.counter.checkpoint();
  const request = state.tail.then(() => state.owner.runWriter((db) => saveForegroundTime(db, {
    sourceId: state.sourceId, buckets, hash: iosCompanionContentHash,
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
  const state: Recording = { owner, sourceId: createCompanionUuid(),
    counter: new ForegroundTimeCounter(() => ({ wallMs: Date.now(), monotonicMs: performance.now() })),
    active: false, timer: null, unsubscribes: [], tail: Promise.resolve() };
  recording = state;
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
