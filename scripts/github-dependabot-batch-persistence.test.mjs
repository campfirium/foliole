import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const sourceRoot = process.cwd();
let root;
let codexHome;
let stateFile;
let deliveries;

function prepareProducer() {
  fs.mkdirSync(path.join(sourceRoot, '.tmp/artifacts/T678'), { recursive: true });
  root = fs.realpathSync(fs.mkdtempSync(path.join(sourceRoot, '.tmp/artifacts/T678/producer-')));
  codexHome = path.join(root, 'codex');
  stateFile = path.join(root, '.tmp/github-desktop-handoff-monitor/state.json');
  deliveries = path.join(root, 'deliveries.jsonl');
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const name of [
    'github-desktop-handoff-monitor', 'github-desktop-handoff-events',
    'github-desktop-handoff-pr-events', 'github-desktop-handoff-title',
    'github-monitor-gh', 'github-actions-handoff-policy', 'github-dependabot-alert-events'
  ]) fs.copyFileSync(path.join(sourceRoot, `scripts/${name}.mjs`), path.join(root, `scripts/${name}.mjs`));
  fs.cpSync(path.join(sourceRoot, 'scripts/security'), path.join(root, 'scripts/security'), { recursive: true });
  fs.symlinkSync(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(root, 'pr'), 'console.log(process.env.TEST_PRS);');
  fs.writeFileSync(path.join(root, 'clock.mjs'), 'Date.now = () => Number(process.env.TEST_NOW);');
  prepareHandoffBoundary();
}

function prepareHandoffBoundary() {
  const monitorDir = path.join(codexHome, 'local-tools/desktop-handoff/projects/foliole/monitors');
  const submitDir = path.join(codexHome, 'skills/codex-desktop-handoff/scripts');
  fs.mkdirSync(monitorDir, { recursive: true });
  fs.mkdirSync(submitDir, { recursive: true });
  fs.writeFileSync(path.join(monitorDir, 'github-prs.json'), JSON.stringify({
    enabled: true, repository: 'owner/repo', batchTemplate: 'batch.md',
    dedupeKeyPattern: 'pr:{eventId}'
  }));
  fs.writeFileSync(path.join(monitorDir, 'batch.md'), '{{prList}}');
  fs.writeFileSync(path.join(submitDir, 'submit-event.mjs'), [
    "import fs from 'node:fs';",
    'if (process.env.TEST_SUBMIT_FAIL) process.exit(1);',
    "fs.appendFileSync(process.env.TEST_DELIVERIES, JSON.stringify(process.argv.slice(2)) + '\\n');",
    "console.log('{\"ok\":true}');"
  ].join('\n'));
}

function scan(seconds, numbers, { emit = true, fail = false } = {}) {
  const proposals = numbers.map(input => {
    const number = typeof input === 'object' ? input.number : input;
    return {
      number, title: `Update ${number}`, baseRefName: 'dev', headRefName: `deps/${number}`,
      headRefOid: `head-${number}`, author: { login: 'app/dependabot' },
      url: `https://github.com/owner/repo/pull/${number}`,
      ...(typeof input === 'object' ? input : {})
    };
  });
  return JSON.parse(execFileSync(process.execPath, [
    '--import', path.join(root, 'clock.mjs'),
    path.join(root, 'scripts/github-desktop-handoff-monitor.mjs'), 'scan',
    ...(emit ? ['--emit'] : [])
  ], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: {
    ...process.env, CODEX_HOME: codexHome, GH_PATH: process.execPath,
    TEST_PRS: JSON.stringify(proposals), TEST_NOW: String(1793516858000 + seconds * 1000),
    TEST_DELIVERIES: deliveries, TEST_SUBMIT_FAIL: fail ? '1' : ''
  } }));
}

const readState = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));

describe('Dependabot producer persisted handoffs', () => {
  beforeEach(prepareProducer);
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('persists the cross-process arrival window and delivers once without replaying old PRs', () => {
    expect(scan(0, [179]).events).toEqual([]);
    expect(scan(60, [179, 180, 181, 182, 183]).events).toEqual([]);
    expect(scan(120, [179, 180, 181, 182, 183, 184]).events).toEqual([]);
    expect(readState().prs).toEqual({});
    const events = scan(420, [179, 180, 181, 182, 183, 184]).events;
    expect(events[0].prNumbers).toEqual(['179', '180', '181', '182', '183', '184']);
    expect(readState().dependabotBatches).toEqual({});
    expect(Object.keys(readState().prs)).toHaveLength(6);
    expect(scan(480, [179, 180, 181, 182, 183, 184]).events).toEqual([]);
    const submitted = fs.readFileSync(deliveries, 'utf8').trim().split('\n').map(JSON.parse);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toContain('pr:dependabot:dev:179-180-181-182-183-184');
  });

  it('does not checkpoint previews or failed delivery and retries after a process restart', () => {
    expect(scan(0, [1]).events).toEqual([]);
    const pending = fs.readFileSync(stateFile, 'utf8');
    expect(scan(300, [1], { emit: false }).events[0].prNumbers).toEqual(['1']);
    expect(fs.readFileSync(stateFile, 'utf8')).toBe(pending);
    expect(() => scan(300, [1], { fail: true })).toThrow();
    expect(readState().prs).toEqual({});
    expect(readState().submitted).toEqual({});
    expect(scan(301, [1]).events[0].prNumbers).toEqual(['1']);
    expect(readState().prs).toEqual({ 1: 'dependabot:dev:1' });
    expect(scan(302, [1]).events).toEqual([]);
  });

  it('delivers both verified bots in one persisted window across failed delivery and restart', () => {
    const renovate = { number: 2, author: { login: 'app/renovate' } };
    expect(scan(0, [1]).events).toEqual([]);
    expect(scan(240, [1, renovate]).events).toEqual([]);
    expect(scan(300, [1, renovate]).events).toEqual([]);
    expect(() => scan(540, [1, renovate], { fail: true })).toThrow();
    expect(readState().prs).toEqual({});
    const events = scan(541, [renovate, 1]).events;
    expect(events).toHaveLength(1);
    expect(events[0].prNumbers).toEqual(['1', '2']);
    expect(events[0].handlingMode).toBe('classify-then-handle-batch');
    expect(events[0].prompt).toContain('app/renovate');
    expect(events[0].prompt).toContain('app/dependabot');
    expect(Object.keys(readState().prs).sort()).toEqual(['1', '2']);
    expect(readState().dependabotBatches).toEqual({});
    expect(scan(600, [1, { ...renovate, headRefOid: 'rebased' }]).events).toEqual([]);
    expect(fs.readFileSync(deliveries, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('keeps old pending deadlines and delivered review checkpoints when adding Renovate', () => {
    scan(0, [1]);
    const state = readState();
    state.prs['2'] = '2:proposal';
    state.submitted['pr:4:local'] = { emittedAt: '2026-11-01T00:00:00Z' };
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const delivered = { number: 2, author: { login: 'app/renovate' } };
    const fresh = { number: 3, author: { login: 'app/renovate' } };
    const legacy = { number: 4, author: { login: 'app/dependabot' } };
    expect(scan(1799, [1, delivered, fresh, legacy]).events).toEqual([]);
    const events = scan(1800, [1, delivered, fresh, legacy]).events;
    expect(events).toHaveLength(1);
    expect(events[0].prNumbers).toEqual(['1', '3']);
    expect(readState().prs['2']).toBe('2:proposal');
    expect(scan(1801, [1, delivered, fresh, legacy]).events).toEqual([]);
  });

});
