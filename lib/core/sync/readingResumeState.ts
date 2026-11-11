import { z } from 'zod';

import { compareSyncFactText } from './syncFactKeyOrder.js';

const revision = z.number().int().positive();
const clock = z.record(z.string().min(1), revision);
const position = z.object({
  actor: z.string().min(1),
  clock,
  offset: z.number().int().nonnegative()
}).strict();
const payload = z.object({
  positions: z.array(z.tuple([z.string().regex(/^[a-f0-9]{64}$/u), position])).nonempty()
}).strict();

type ReadingPosition = z.infer<typeof position>;
type ReadingResumeEntry = z.infer<typeof payload>['positions'][number];
export type ReadingResumeState = z.infer<typeof payload>;

export function parseReadingResumeState(json: string): ReadingResumeState {
  const parsed = payload.parse(JSON.parse(json));
  if (parsed.positions.some(([, value]) => !Object.hasOwn(value.clock, value.actor))) {
    throw new Error('reading_resume_actor_revision_missing');
  }
  return mergeReadingResumeStates(null, parsed);
}

function precedes(left: ReadingPosition, right: ReadingPosition) {
  return Object.entries(left.clock).every(([actor, version]) => version <= revisionFor(right.clock, actor)) &&
    Object.entries(right.clock).some(([actor, version]) => version > revisionFor(left.clock, actor));
}

function revisionFor(values: ReadingPosition['clock'], actor: string) {
  return Object.hasOwn(values, actor) ? values[actor]! : 0;
}

function canonicalPosition(value: ReadingPosition) {
  return { ...value, clock: Object.fromEntries(Object.entries(value.clock).sort(([left], [right]) =>
    compareSyncFactText(left, right))) };
}

function entryKey([, value]: ReadingResumeEntry) {
  return JSON.stringify([value.actor, revisionFor(value.clock, value.actor)]);
}

export function mergeReadingResumeStates(left: ReadingResumeState | null, right: ReadingResumeState): ReadingResumeState {
  const unique = new Map<string, ReadingResumeEntry>();
  for (const [content, candidate] of [...(left?.positions ?? []), ...right.positions]) {
    const entry: ReadingResumeEntry = [content, canonicalPosition(candidate)];
    const key = entryKey(entry);
    const prior = unique.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(entry)) throw new Error('reading_resume_revision_conflict');
    unique.set(key, entry);
  }
  const candidates = [...unique.values()];
  return { positions: candidates.filter(entry => !candidates.some(other =>
    precedes(entry[1], other[1])
  )).sort((a, b) => compareSyncFactText(entryKey(a), entryKey(b))) };
}

export function readReadingResumeClock(state: ReadingResumeState | null) {
  const versions = new Map<string, number>();
  for (const [, value] of state?.positions ?? []) {
    for (const [writer, version] of Object.entries(value.clock)) {
      versions.set(writer, Math.max(versions.get(writer) ?? 0, version));
    }
  }
  return Object.fromEntries(versions);
}

export function advanceReadingResume(
  state: ReadingResumeState | null, contentHash: string, actor: string, offset: number,
  observed: ReadingPosition['clock'] = readReadingResumeClock(state)
): ReadingResumeState {
  const known = readReadingResumeClock(state);
  const versions = { ...observed, [actor]: revisionFor(known, actor) + 1 };
  return mergeReadingResumeStates(state, {
    positions: [[contentHash, { actor, clock: versions, offset }]]
  });
}

export function readReadingResumeOffset(state: ReadingResumeState | null, contentHash: string): number | undefined {
  let offset: number | undefined;
  for (const [content, candidate] of state?.positions ?? []) {
    if (content === contentHash) offset = Math.max(offset ?? 0, candidate.offset);
  }
  return offset;
}
