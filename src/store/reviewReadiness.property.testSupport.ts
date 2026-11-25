import type { DailyFlowSettings } from '../../lib/core/flow/dailyFlowContract';
import { dailyFlowSettingsForInstant } from '../../lib/core/flow/dailyFlowDayWindow';
import { flowPlan, prepareDailyFlowPlans } from '../../lib/core/flow/dailyFlowPlanning';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings';

import { createReviewNode } from './reviewQueuePlanner.test-support';
import { isReviewProfileDue } from './reviewQueuePlannerTime';

// Zones with DST, half-hour and 45-minute offsets, and both date-line extremes.
const ZONES = ['UTC', 'Asia/Shanghai', 'America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe',
  'America/St_Johns', 'Asia/Kathmandu', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const YEAR_START = Date.parse('2026-01-01T00:00:00.000Z');

export interface ReadinessCase {
  seed: number;
  creatorZone: string;
  graderZone: string;
  creatorHour: number;
  graderHour: number;
  window: { start: string; end: string };
  now: string;
  cards: { id: string; due: string; scheduledDays: number }[];
}

export interface ReadinessResult { seed: number; queuedNotGradable: string[]; gradableNotQueued: string[] }

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

function zoneOffset(zone: string, instant: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(instant).map(part => [part.type, Number(part.value)]));
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - Math.floor(instant / 1000) * 1000;
}

/** Another device's wall clock, computed without changing this process timezone. */
function zonedInstant(zone: string, year: number, month: number, day: number, hour: number) {
  const wall = Date.UTC(year, month, day, hour);
  const guess = wall - zoneOffset(zone, wall);
  return wall - zoneOffset(zone, guess);
}

function zonedDate(zone: string, instant: number) {
  const local = new Date(instant + zoneOffset(zone, instant));
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

function learningDayStart(zone: string, instant: number, hour: number, plusDays = 0) {
  const { year, month, day } = zonedDate(zone, instant - hour * HOUR_MS);
  return zonedInstant(zone, year, month, day + plusDays, hour);
}

export function generateReadinessCase(seed: number): ReadinessCase {
  const next = random(seed);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const creatorZone = pick(ZONES);
  const graderZone = next() < 0.5 ? creatorZone : pick(ZONES);
  const creatorHour = Math.floor(next() * 24);
  const graderHour = next() < 0.6 ? creatorHour : Math.floor(next() * 24);
  const created = YEAR_START + Math.floor(next() * 360 * DAY_MS);
  const start = learningDayStart(creatorZone, created, creatorHour);
  const end = learningDayStart(creatorZone, created, creatorHour, 1);
  const window = { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
  const nowMs = start - 6 * HOUR_MS + Math.floor(next() * (end - start + 9 * HOUR_MS));
  const cards = Array.from({ length: 12 }, (_, index) => {
    const writerZone = pick([creatorZone, graderZone, pick(ZONES)]);
    const writerHour = pick([creatorHour, graderHour, Math.floor(next() * 24)]);
    const shape = Math.floor(next() * 4);
    const near = nowMs + Math.floor((next() * 6 - 3) * DAY_MS);
    if (shape === 0) {
      // Graded on some device: that device's learning-day start `scheduledDays` days later.
      const scheduledDays = 1 + Math.floor(next() * 20);
      const due = learningDayStart(writerZone, near - scheduledDays * DAY_MS, writerHour, scheduledDays);
      return { id: `graded-${index}`, due: new Date(due).toISOString(), scheduledDays };
    }
    if (shape === 1) {
      // Imported (for example from SuperMemo): a calendar date at the importer's local midnight.
      const { year, month, day } = zonedDate(writerZone, near);
      return { id: `imported-${index}`, due: new Date(zonedInstant(writerZone, year, month, day, 0)).toISOString(),
        scheduledDays: 1 + Math.floor(next() * 40) };
    }
    if (shape === 2) {
      // Learning and relearning steps keep their exact instant.
      return { id: `step-${index}`, due: new Date(nowMs + Math.floor((next() * 2 - 1) * 2 * HOUR_MS)).toISOString(), scheduledDays: 0 };
    }
    return { id: `raw-${index}`, due: new Date(near).toISOString(), scheduledDays: Math.floor(next() * 3) };
  });
  return { seed, creatorZone, graderZone, creatorHour, graderHour, window, now: new Date(nowMs).toISOString(), cards };
}

/** Runs in a process whose host timezone is the grading device's zone. */
export async function evaluateReadinessCase(testCase: ReadinessCase): Promise<ReadinessResult> {
  const nodes = testCase.cards.map(card => createReviewNode(card.id, card.due, { scheduledDays: card.scheduledDays, state: 2 }));
  const snapshot = { nodeOrder: nodes.map(node => node.id), nodesById: Object.fromEntries(nodes.map(node => [node.id, node])),
    trashedNodeIds: [] as string[] };
  const base: DailyFlowSettings = { newDayStartsAtHour: testCase.graderHour,
    pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue, dayWindow: testCase.window };
  // The grading device applies the same window policy as every Flow writer.
  const settings = await dailyFlowSettingsForInstant(null as never, base, testCase.now, false, null);
  const planned = new Set(flowPlan(snapshot, 'review-first', testCase.now, settings).fsrsQueueNodeIds);
  const opened = prepareDailyFlowPlans(snapshot, { now: testCase.now, mode: 'review-first' }, settings).initial.fsrsQueueNodeIds;
  const gradable = new Set(nodes.filter(node => isReviewProfileDue(node.review, testCase.now, settings.newDayStartsAtHour,
    settings.dayWindow)).map(node => node.id));
  return { seed: testCase.seed, queuedNotGradable: [...new Set([...planned, ...opened])].filter(id => !gradable.has(id)),
    gradableNotQueued: [...gradable].filter(id => !planned.has(id)) };
}

export function assertReadinessHostZone(zone: string) {
  // Prove the host zone really applies before trusting any verdict.
  if (new Date(2026, 0, 1).getTime() !== zonedInstant(zone, 2026, 0, 1, 0)) throw new Error(`host timezone ${zone} not applied`);
}

async function readStandardInput() {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}

/** Child-process entry: the parent sets TZ to the grading zone and writes the cases to stdin. */
async function main() {
  const zone = process.env.TZ ?? '';
  assertReadinessHostZone(zone);
  const cases = JSON.parse(await readStandardInput()) as ReadinessCase[];
  const results = [];
  for (const testCase of cases) results.push(await evaluateReadinessCase(testCase));
  process.stdout.write(`${JSON.stringify({ zone, results })}\n`);
}

if (process.env.REVIEW_READINESS_CHILD === '1') {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
