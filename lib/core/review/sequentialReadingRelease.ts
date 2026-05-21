import type { ReadingState } from './readingState.js';

export type SequentialReadingReleaseMode = 'free' | 'sequential';

export interface SequentialReadingReleaseCandidate {
  content: string;
  nodeId: string;
  priority?: number | null;
  reading?: {
    intervalDurationMs?: number | null;
    intervalGrowthFactor?: number | null;
    lastHandledAt?: string | null;
    nextAt?: string | null;
    priority?: number | null;
    readingPosition?: number | null;
    repetitionCount?: number | null;
    state?: ReadingState | null;
  } | null;
}

export interface SequentialReadingReleaseProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: ReadingState;
}

export interface SequentialReadingReleaseUpdate {
  nodeId: string;
  reading: SequentialReadingReleaseProfile;
}

export function isPreservedSequentialReadingReleaseState(state: ReadingState | null | undefined) {
  return state === 'dismissed' || state === 'done';
}

function createReadingProfile(args: {
  candidate: SequentialReadingReleaseCandidate;
  defaultPriority: number;
  now: string;
  state: ReadingState;
}): SequentialReadingReleaseProfile {
  const current = args.candidate.reading;
  return {
    intervalDurationMs: current?.intervalDurationMs ?? 0,
    intervalGrowthFactor: current?.intervalGrowthFactor ?? 1,
    lastHandledAt: current?.lastHandledAt ?? args.now,
    nextAt: current?.nextAt ?? args.now,
    priority: current?.priority ?? args.candidate.priority ?? args.defaultPriority,
    readingPosition: current?.readingPosition ?? 0,
    repetitionCount: current?.repetitionCount ?? 0,
    state: args.state
  };
}

export function buildSequentialReadingReleaseUpdates(args: {
  candidates: SequentialReadingReleaseCandidate[];
  defaultPriority: number;
  mode: SequentialReadingReleaseMode;
  now: string;
}) {
  let released = false;
  const updates: SequentialReadingReleaseUpdate[] = [];
  for (const candidate of args.candidates) {
    if (!candidate.content.trim() || isPreservedSequentialReadingReleaseState(candidate.reading?.state)) {
      continue;
    }
    const state = args.mode === 'sequential' ? (released ? 'locked' : 'active') : 'active';
    released ||= args.mode === 'sequential';
    if (candidate.reading?.state === state) {
      continue;
    }
    updates.push({
      nodeId: candidate.nodeId,
      reading: createReadingProfile({
        candidate,
        defaultPriority: args.defaultPriority,
        now: args.now,
        state
      })
    });
  }
  return updates;
}
