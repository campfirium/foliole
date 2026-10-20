// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  budgetPreflightTests, parsePreflightDurations, PREFLIGHT_BUDGET_SECONDS, PREFLIGHT_DURATIONS_FILE,
  PREFLIGHT_HEAVY_SECONDS, refreshPreflightDurations
} from './remote-quality-preflight-budget.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));
const entries = (...files) => files.map((file) => ({ file, reasons: [] }));
const names = (list) => list.map(({ file }) => file);

it('leaves known heavy files to the remote run whatever their priority', () => {
  const plan = budgetPreflightTests(entries('heavy.test.mjs', 'a.test.mjs', 'b.test.mjs'), {
    cap: 120, durations: { 'heavy.test.mjs': 61, 'a.test.mjs': 60 }
  });
  expect(names(plan.run)).toEqual(['a.test.mjs', 'b.test.mjs']);
  expect(names(plan.heavy)).toEqual(['heavy.test.mjs']);
  expect(names(plan.deferred)).toEqual(['heavy.test.mjs']);
  expect(plan.estimatedSeconds).toBe(62);
});

it('fills the time budget in priority order and keeps smaller later files that still fit', () => {
  const plan = budgetPreflightTests(entries('a.test.mjs', 'b.test.mjs', 'c.test.mjs', 'd.test.mjs'), {
    budgetSeconds: 100, cap: 120, durations: { 'a.test.mjs': 50, 'b.test.mjs': 55, 'c.test.mjs': 40 }
  });
  expect(names(plan.run)).toEqual(['a.test.mjs', 'c.test.mjs', 'd.test.mjs']);
  expect(names(plan.deferred)).toEqual(['b.test.mjs']);
  expect(plan.heavy).toEqual([]);
  expect(plan.estimatedSeconds).toBe(92);
});

it('keeps the file cap and estimates unmeasured files with the default', () => {
  const plan = budgetPreflightTests(entries('a.test.mjs', 'b.test.mjs', 'c.test.mjs'), { cap: 2 });
  expect(names(plan.run)).toEqual(['a.test.mjs', 'b.test.mjs']);
  expect(names(plan.deferred)).toEqual(['c.test.mjs']);
  expect(plan).toMatchObject({ budgetSeconds: PREFLIGHT_BUDGET_SECONDS, estimatedSeconds: 4 });
});

it('ships a parseable table that marks the known remote-only sync files heavy', () => {
  const durations = parsePreflightDurations(fs.readFileSync(PREFLIGHT_DURATIONS_FILE, 'utf8'));
  for (const file of [
    'electron/sync/desktopRequestSyncLargeOverwrite.integration.test.ts',
    'electron/sync/desktopFramedSyncCompleteInventory.integration.test.ts',
    'electron/sync/desktopRequestSyncScale.integration.test.ts'
  ]) {
    expect(fs.existsSync(file)).toBe(true);
    expect(durations[file]).toBeGreaterThan(PREFLIGHT_HEAVY_SECONDS);
  }
  expect(Object.keys(durations).every((file) => fs.existsSync(file))).toBe(true);
  expect(parsePreflightDurations('')).toEqual({});
  const table = JSON.stringify({ seconds: { 'a.test.mjs': 5, 'b.test.mjs': 7 }, windowsSeconds: { 'a.test.mjs': 90 } });
  expect(parsePreflightDurations(table)).toEqual({ 'a.test.mjs': 5, 'b.test.mjs': 7 });
  expect(parsePreflightDurations(table, 'windows')).toEqual({ 'a.test.mjs': 90, 'b.test.mjs': 7 });
  expect(() => parsePreflightDurations('{}')).toThrow('no seconds map');
});

it('refreshes durations from newer passed reports and drops files that got fast or vanished', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-budget-'));
  roots.push(root);
  for (const file of ['a.test.mjs', 'b.test.mjs', 'c.test.mjs']) fs.writeFileSync(path.join(root, file), '');
  const report = (name, results, mtime) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, JSON.stringify({ testResults: results.map(([test, seconds, status = 'passed']) => ({
      endTime: 1000 + seconds * 1000, name: path.join(root, test), startTime: 1000, status
    })) }));
    fs.utimesSync(file, mtime, mtime);
    return file;
  };
  const older = report('old.json', [['a.test.mjs', 30], ['b.test.mjs', 9]], 1);
  const newer = report('new.json', [['a.test.mjs', 12.4], ['b.test.mjs', 2], ['c.test.mjs', 90, 'failed']], 2);
  expect(refreshPreflightDurations({
    cwd: root, current: { 'c.test.mjs': 7, 'gone.test.mjs': 99 }, reports: [newer, older]
  })).toEqual({ 'a.test.mjs': 12, 'c.test.mjs': 7 });
});
