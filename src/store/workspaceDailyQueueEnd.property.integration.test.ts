// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { act, node, now, open, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

import { isReviewProfileDue } from './reviewQueuePlannerTime';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

afterEach(async () => { await closeLibraries(); });

type Violation = { seed: number; step: number; at: string; problem: string; session: Partial<DailyFlowSession> };

async function walk(seed: number): Promise<Violation | null> {
  const next = random(seed);
  const [peer] = await setupPeers();
  const items = 2 + Math.floor(next() * 5);
  const topics = Math.floor(next() * 3);
  const review = peer.db.prepare(`INSERT OR REPLACE INTO node_review
    (node_id, due, last_review_at, state, stability, difficulty, scheduled_days, reps) VALUES (?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < items; index++) {
    const id = `item-${index}`;
    node(peer, id, 'item', null, next() < 0.7);
    const shape = Math.floor(next() * 3);
    const due = shape === 0 ? Date.parse(now) - Math.floor(next() * 3 * DAY_MS)
      : shape === 1 ? Date.parse(now) + Math.floor(next() * 120 * MINUTE_MS) : Date.parse(now) + Math.floor((0.5 + next()) * DAY_MS);
    const scheduledDays = shape === 1 ? 0 : 1 + Math.floor(next() * 10);
    review.run(id, new Date(due).toISOString(), new Date(due - scheduledDays * DAY_MS).toISOString(), 2,
      1 + next() * 20, 1 + next() * 8, scheduledDays, 1 + Math.floor(next() * 5));
  }
  for (let index = 0; index < topics; index++) node(peer, `topic-${index}`, 'topic');
  let at = Date.parse(now);
  let session = await open(peer, now);
  const check = async (step: number): Promise<Violation | null> => {
    const stamp = new Date(at).toISOString();
    const cycle = session.cycle!;
    const fail = (problem: string) => ({ seed, step, at: stamp, problem, session: { currentNodeId: session.currentNodeId, cycle } });
    // The clear mark and the counter describe the same queue end.
    if ((cycle.clearedAt !== null) !== (cycle.remaining === 0)) return fail('clear mark disagrees with counter');
    const current = session.currentNodeId ? (await snapshot(peer)).nodesById[session.currentNodeId] : undefined;
    // Every card Flow serves is gradable by the same rule the grading guards use.
    if (current?.kind === 'item' && !isReviewProfileDue(current.review, stamp, 4, session.dayWindow)) {
      return fail('served card is not gradable');
    }
    return null;
  };
  for (let step = 0; step < 40; step++) {
    const violation = await check(step);
    if (violation) return violation;
    at += Math.floor(next() * 15 * MINUTE_MS);
    const stamp = new Date(at).toISOString();
    if (!session.currentNodeId) {
      session = await open(peer, stamp);
      continue;
    }
    const kind = (await snapshot(peer)).nodesById[session.currentNodeId]?.kind;
    session = kind === 'item'
      ? await act(peer, session, 'grade', stamp, undefined, (1 + Math.floor(next() * 4)) as 1 | 2 | 3 | 4)
      : await act(peer, session, 'read', stamp);
  }
  return check(40);
}

it('keeps the queue-end mark, the remaining counter and served cards consistent through random Flow walks', async () => {
  const violations: Violation[] = [];
  for (let seed = 1; seed <= 20 && violations.length < 2; seed++) {
    const violation = await walk(seed);
    if (violation) violations.push(violation);
    await closeLibraries();
  }
  expect(violations).toEqual([]);
}, 120_000);
