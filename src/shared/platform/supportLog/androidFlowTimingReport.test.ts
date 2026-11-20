import { expect, it } from 'vitest';

import { validateAndroidFlowTiming } from './androidFlowTimingReport';

const valid = () => ({
  build: 'unidentified', omitted: 0,
  events: [{ operation: 1, action: 'soon', stage: 'choose-next-rows', status: 'done', atMs: 10, count: 32 }],
  attachments: [{ kind: 'observe', fromMs: 0, toMs: 20, status: 'done' }],
  activities: [{ kind: 'native.write-image', fromMs: 1, toMs: 9, status: 'done', queueMs: 5, runMs: 3 },
    { kind: 'folder-backup', fromMs: 0, toMs: 30, status: 'pending' }],
  writerWaits: [{ operation: 1, stage: 'open-writer', atMs: 210, active: ['observe', 'sync'] }],
  cards: [{ operation: 1, role: 'current', images: 3, imageBytes: 9_000, unsizedImages: 1, bodyChars: 400 }],
  mainThread: { source: 'interval', longTasks: 2, maxMs: 90 },
  session: { appRunningMs: 5_000, sinceDayStartMs: 3_600_000, nodes: 12, attachmentFiles: null, attachmentBytes: null,
    observedToday: false }
});

it('accepts a complete redacted Flow report', () => {
  expect(validateAndroidFlowTiming(valid())).toBe(true);
  expect(validateAndroidFlowTiming({ ...valid(), session: null })).toBe(true);
});

it.each([
  ['an unknown top-level field', (report: ReturnType<typeof valid>) => Object.assign(report, { note: 'x' })],
  ['a count on an uncounted stage', (report: ReturnType<typeof valid>) => { report.events[0]!.stage = 'write'; }],
  ['a missing scan count', (report: ReturnType<typeof valid>) => { delete (report.events[0] as { count?: number }).count; }],
  ['an unknown activity', (report: ReturnType<typeof valid>) => { report.activities[1]!.kind = 'https://private.example'; }],
  ['executor timing on JavaScript work', (report: ReturnType<typeof valid>) => {
    Object.assign(report.activities[1]!, { queueMs: 1, runMs: 1 }); }],
  ['half an executor timing', (report: ReturnType<typeof valid>) => { delete (report.activities[0] as { runMs?: number }).runMs; }],
  ['an unknown writer holder', (report: ReturnType<typeof valid>) => { report.writerWaits[0]!.active.push('node-id'); }],
  ['a repeated writer holder', (report: ReturnType<typeof valid>) => { report.writerWaits[0]!.active.push('sync'); }],
  ['more unsized images than images', (report: ReturnType<typeof valid>) => { report.cards[0]!.unsizedImages = 4; }],
  ['card text', (report: ReturnType<typeof valid>) => { Object.assign(report.cards[0]!, { title: 'private' }); }],
  ['too many cards', (report: ReturnType<typeof valid>) => { report.cards = Array(257).fill(report.cards[0]); }],
  ['a stall longer than the recording', (report: ReturnType<typeof valid>) => { report.mainThread.maxMs = 300_001; }],
  ['an unknown main-thread source', (report: ReturnType<typeof valid>) => {
    (report.mainThread as { source: string }).source = 'trace'; }],
  ['a fractional library size', (report: ReturnType<typeof valid>) => { report.session.nodes = 1.5; }],
  ['a day offset beyond one day', (report: ReturnType<typeof valid>) => { report.session.sinceDayStartMs = 90_000_001; }]
])('rejects %s', (_name, mutate) => {
  const report = valid();
  mutate(report);
  expect(validateAndroidFlowTiming(report)).toBe(false);
});
