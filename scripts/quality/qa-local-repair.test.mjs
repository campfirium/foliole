// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { failedTestsByJob, isTestOnlyFile, readLocalRepairBase } from './qa-local-repair.mjs';

let root = '';
afterEach(() => { if (root) rmSync(root, { force: true, recursive: true }); root = ''; });

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function commit(file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
  git('add', '.');
  git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '-qm', file);
  return git('rev-parse', 'HEAD');
}

function repository() {
  root = mkdtempSync(path.join(os.tmpdir(), 'qa-local-repair-'));
  git('init', '-q', '-b', 'review');
  const base = commit('src/app/Panel.tsx', 'export {};\n');
  return { base };
}

const failedLog = [
  'full-quality / t5-desktop-source / Ubuntu first\tRun tests\t2026-11-20T11:40:00Z [vitest-summary] fail 1. '
    + '/home/runner/work/foliole/foliole/src/app/Panel.test.tsx :: shows the panel',
  'full-quality / t5-desktop-source / Ubuntu first\tRun tests\tnoise'
].join('\n');

function gh({ baseSha, jobs, log = failedLog, status = 'completed', branch = 'review' }) {
  return args => {
    if (args[0] === 'repo') return 'campfirium/foliole\n';
    if (args[0] === 'run') return log;
    if (args.includes('--paginate')) return JSON.stringify([{ jobs }]);
    return JSON.stringify({ status, head_branch: branch, head_sha: baseSha, html_url: 'https://example.invalid/run' });
  };
}

const failingJobs = [
  { name: 'full-quality / t5-desktop-source / Ubuntu first', conclusion: 'failure' },
  { name: 'full-quality / t5-desktop-source / Desktop source quality admission', conclusion: 'failure' },
  { name: 'full-quality / quality-admission / verdict', conclusion: 'failure' },
  { name: 'full-quality / t5-shared / Ubuntu shared', conclusion: 'success' }
];

describe('local repair evidence', () => {
  it('classifies test and test-support files as test-only', () => {
    expect(isTestOnlyFile('src/app/Panel.test.tsx')).toBe(true);
    expect(isTestOnlyFile('src/companion/companionDirectoryBatch.test-support.tsx')).toBe(true);
    expect(isTestOnlyFile('src/app/components/readwiseReaderSettingsTestSupport.ts')).toBe(true);
    expect(isTestOnlyFile('src/test/setup.ts')).toBe(true);
    expect(isTestOnlyFile('src/app/Panel.tsx')).toBe(false);
    expect(isTestOnlyFile('package.json')).toBe(false);
  });

  it('maps failed vitest files to their job from hosted and Windows log paths', () => {
    const byJob = failedTestsByJob(`${failedLog}\nWindows one\tRun\t[vitest-summary] fail 1. D:/a/foliole/foliole/scripts/x.test.mjs :: y`);
    expect([...byJob.get('full-quality / t5-desktop-source / Ubuntu first')]).toEqual(['src/app/Panel.test.tsx']);
    expect([...byJob.get('Windows one')]).toEqual(['scripts/x.test.mjs']);
  });

  it('accepts a base run whose only failure is a test file the repair changed', () => {
    const { base } = repository();
    commit('src/app/Panel.test.tsx', 'it.todo("panel");\n');
    const record = { branch: 'review', worktreePath: root, head: git('rev-parse', 'HEAD') };
    git('checkout', '-q', base);
    commit('src/app/Panel.test.tsx', 'broken\n');
    const baseSha = git('rev-parse', 'HEAD');
    commit('src/app/Panel.test.tsx', 'fixed\n');
    record.head = git('rev-parse', 'HEAD');

    expect(readLocalRepairBase({ record, baseRunId: 1, gh: gh({ baseSha, jobs: failingJobs }) })).toEqual({
      baseSha, changed: ['src/app/Panel.test.tsx'], failedTests: ['src/app/Panel.test.tsx'], url: 'https://example.invalid/run'
    });
  });

  it('refuses product changes, unrepaired failures, unattributed and incomplete jobs', () => {
    const { base } = repository();
    const record = { branch: 'review', worktreePath: root, head: '' };
    commit('src/app/Panel.test.tsx', 'fixed\n');
    record.head = git('rev-parse', 'HEAD');
    const read = options => () => readLocalRepairBase({ record, baseRunId: 1, gh: gh({ baseSha: base, jobs: failingJobs, ...options }) });

    expect(read({ log: 'full-quality / t5-desktop-source / Ubuntu first\tRun\tSegmentation fault' }))
      .toThrow('no attributable test failure');
    expect(read({ jobs: [...failingJobs, { name: 'full-quality / t6-ios / iOS', conclusion: 'cancelled' }] }))
      .toThrow('incomplete or cancelled');
    expect(read({ jobs: failingJobs.filter(job => job.conclusion === 'success') })).toThrow('no repairable test failure');
    expect(read({ status: 'in_progress' })).toThrow('completed hosted run');

    commit('src/app/Panel.tsx', 'export const changed = true;\n');
    record.head = git('rev-parse', 'HEAD');
    expect(read({})).toThrow('only covers test files');

    git('reset', '-q', '--hard', 'HEAD~2');
    commit('src/app/Other.test.tsx', 'other\n');
    record.head = git('rev-parse', 'HEAD');
    expect(read({})).toThrow('Failed tests were not repaired: src/app/Panel.test.tsx');
  });
});
