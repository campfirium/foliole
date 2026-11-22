// @vitest-environment node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { cleanupConfig, runRound } from './scheduled-disk-cleanup.mjs';
import { DAY_MS, classifyArtifacts, purgeQuarantine, readLedgerContext } from './scheduled-disk-cleanup-steps.mjs';

const nowMs = Date.now();

function write(filePath, content = 'x', ageDays = 0) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  age(filePath, ageDays);
}

function age(target, ageDays) {
  const time = new Date(nowMs - ageDays * DAY_MS);
  fs.utimesSync(target, time, time);
}

const FAKE_HELPER = `
const fs = require('node:fs'); const path = require('node:path');
const root = process.env.FAKE_ARTIFACTS; const out = path.join(root, 'local-cleanup', String(Date.now()));
fs.mkdirSync(out, { recursive: true });
const candidates = fs.readdirSync(root).filter((name) => /^T1\\d\\d/.test(name)).map((name) => ({
  path: path.join(root, name), task: name, newest_mtime: fs.statSync(path.join(root, name, 'data')).mtimeMs / 1000 }));
const task = process.argv.includes('--task') ? process.argv[process.argv.indexOf('--task') + 1] : null;
if (task) fs.rmSync(path.join(root, task), { recursive: true });
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ candidates }));
console.log(JSON.stringify({ removed_gib: task ? 1 : 0, report: path.join(out, 'report.json') }, null, 2));
`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-scheduled-cleanup-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  spawnSync('git', ['init', '-q', repo]);
  write(path.join(repo, 'scripts/uses.mjs'), "const dir = '.tmp/artifacts/fixed-by-code';\n");
  spawnSync('git', ['-C', repo, 'add', '.']);
  write(path.join(repo, '.lab/atlas/0active/00-tasks-open.md'), '| 编号 | 分组 | 任务 | 状态 |\n| T200 | A0 | open | 进行中 |\n');
  write(path.join(repo, '.lab/atlas/0active/00-trials-open.md'), '| 编号 | 任务 | x | y |\n| C412 | trial | x | 待试 |\n');
  write(path.join(repo, '.lab/atlas/0active/01-tasks-closed.md'), '| 编号 | 任务 | 结果 | 处置依据 |\n| T100 | old | 完成 | |\n');
  write(path.join(repo, '.lab/atlas/0active/T200-plan.md'), 'see `.tmp/artifacts/named-in-plan/run`\n');
  write(path.join(root, 'helper.cjs'), FAKE_HELPER);
  const config = {
    ...cleanupConfig({ homeDirectory: root, repoRoot: repo }),
    closedHelper: path.join(root, 'helper.cjs'),
    helperInterpreter: process.execPath,
    internalVolume: root,
    templateRoots: [path.join(root, 'templates')],
    udVolume: root
  };
  process.env.FAKE_ARTIFACTS = config.artifactsRoot;
  return { config, done: () => fs.rmSync(root, { force: true, recursive: true }), repo, root };
}

function seedArtifacts(artifacts) {
  write(path.join(artifacts, 'T100-closed-old/data'), 'x', 3);
  write(path.join(artifacts, 'T101/data'), 'x', 0.2); // closed but written within 24 hours
  write(path.join(artifacts, 'T200/round-1/db'), 'x', 30);
  write(path.join(artifacts, 'T692L/notes'), 'x', 30);
  write(path.join(artifacts, 'a5-empty-copy/db.sqlite'), 'x', 20);
  write(path.join(artifacts, 'loose-report.log'), 'x', 20);
  write(path.join(artifacts, 'recent-probe/db.sqlite'), 'x', 3);
  write(path.join(artifacts, 'named-in-plan/run/out.json'), 'x', 40);
  write(path.join(artifacts, 'C412-C411/out.json'), 'x', 40);
  write(path.join(artifacts, 'fixed-by-code/out.json'), 'x', 40);
  write(path.join(artifacts, 'agent-item-backups/one.json'), 'x', 40);
  write(path.join(artifacts, 'old-checkout/.git'), 'gitdir: x', 40);
  for (const name of ['a5-empty-copy', 'recent-probe', 'named-in-plan', 'C412-C411', 'fixed-by-code', 'agent-item-backups', 'old-checkout', 'T200', 'T692L']) {
    age(path.join(artifacts, name), 40);
  }
}

describe('scheduled disk cleanup', () => {
  it('quarantines only idle unnumbered artifacts and keeps anything something may still use', () => {
    const { config, done, repo } = fixture();
    try {
      seedArtifacts(config.artifactsRoot);
      const codeReferences = new Set(['fixed-by-code']);
      const result = classifyArtifacts({ artifactsRoot: config.artifactsRoot, codeReferences, ledger: readLedgerContext(repo), nowMs });

      expect(result.quarantine.map((entry) => entry.name)).toEqual(['a5-empty-copy', 'loose-report.log']);
      expect(Object.fromEntries(result.kept.map((entry) => [entry.name, entry.reason]))).toEqual({
        'C412-C411': 'referenced by an open task or trial',
        'agent-item-backups': 'looks like a backup or credential',
        'fixed-by-code': 'fixed path used by repository code',
        'named-in-plan': 'referenced by an open task or trial',
        'old-checkout': 'contains a Git checkout',
        'recent-probe': 'written within 14 days'
      });
      expect(result.owned.map((entry) => [entry.owner, entry.status])).toEqual([
        ['T100', 'closed'], ['T101', 'unknown'], ['T200', 'open'], ['T692', 'unknown']
      ]);
    } finally {
      done();
    }
  });

  it('runs a full round under the gate, leaving a report of every move and removal', () => {
    const { config, done } = fixture();
    try {
      seedArtifacts(config.artifactsRoot);
      fs.appendFileSync(path.join(config.repoRoot, '.lab/atlas/0active/01-tasks-closed.md'), '| T101 | new | 完成 | |\n');
      write(path.join(config.repoRoot, '.tmp/old-run.log'), 'x', 10);
      write(path.join(config.repoRoot, '.tmp/active-cache/nested/fresh'), 'x', 0);
      age(path.join(config.repoRoot, '.tmp/active-cache'), 10);
      write(path.join(config.quarantineRoot, '20200101/stale/db'), 'x', 0);

      expect(() => runRound({ config, env: {}, nowMs })).toThrow('exclusive');
      const report = runRound({ config, env: { FOLIOLE_RESOURCE_GATE_HELD: 'node-heavy,preview,exclusive' }, nowMs });

      expect(report.status).toBe('complete');
      expect(report.steps.closedTasks).toMatchObject({ eligible: ['T100-closed-old'], skippedRecent: ['T101'] });
      expect(fs.existsSync(path.join(config.artifactsRoot, 'T100-closed-old'))).toBe(false);
      expect(fs.existsSync(path.join(config.artifactsRoot, 'T101'))).toBe(true);
      expect(fs.existsSync(path.join(config.artifactsRoot, 'a5-empty-copy'))).toBe(false);
      const moved = report.steps.quarantine.moved.map((item) => item.to);
      expect(moved.every((target) => fs.existsSync(target))).toBe(true);
      expect(fs.readFileSync(path.join(path.dirname(moved[0]), 'manifest.jsonl'), 'utf8')).toContain('a5-empty-copy');
      expect(fs.existsSync(path.join(config.quarantineRoot, '20200101'))).toBe(false);
      expect(fs.existsSync(path.join(config.repoRoot, '.tmp/old-run.log'))).toBe(false);
      expect(fs.existsSync(path.join(config.repoRoot, '.tmp/active-cache/nested/fresh'))).toBe(true);
      expect(fs.readFileSync(path.join(config.reportRoot, 'latest.md'), 'utf8')).toContain('a5-empty-copy');
      expect(JSON.parse(fs.readFileSync(report.reportPath, 'utf8')).free.after.ud).toBeGreaterThan(0);
    } finally {
      done();
    }
  });

  it('stops before touching anything while the A5 device lease is held, and previews without deleting', () => {
    const { config, done } = fixture();
    try {
      seedArtifacts(config.artifactsRoot);
      fs.mkdirSync(config.a5LeasePath, { recursive: true });
      const held = runRound({ config, env: { FOLIOLE_RESOURCE_GATE_HELD: 'exclusive' }, nowMs });
      expect(held).toMatchObject({ interruptedBy: 'A5 设备锁被占用', status: 'interrupted', steps: {} });

      const preview = runRound({ config, nowMs, preview: true });
      expect(preview.steps.quarantine.moved.length).toBe(2);
      expect(fs.existsSync(path.join(config.artifactsRoot, 'a5-empty-copy'))).toBe(true);
      expect(fs.existsSync(path.join(config.artifactsRoot, 'T100-closed-old'))).toBe(true);
    } finally {
      done();
    }
  });

  it('deletes quarantine batches only after fourteen days', () => {
    const { config, done } = fixture();
    try {
      const day = (offset) => {
        const date = new Date(nowMs - offset * DAY_MS);
        return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      };
      write(path.join(config.quarantineRoot, day(15), 'a/file'));
      write(path.join(config.quarantineRoot, day(13), 'b/file'));
      const removed = purgeQuarantine({ apply: true, nowMs, quarantineRoot: config.quarantineRoot });
      expect(removed.map((item) => path.basename(item.path))).toEqual([day(15)]);
      expect(fs.existsSync(path.join(config.quarantineRoot, day(13)))).toBe(true);
    } finally {
      done();
    }
  });
});
