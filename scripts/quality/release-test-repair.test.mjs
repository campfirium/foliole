// @vitest-environment node
/* global structuredClone */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createChainVerdict, fullChainStages, validateChainReuse } from './chain-verdict.mjs';
import { consumeChainVerdict } from './chain-verdict-read.mjs';
import { decideTestRepair, runReleaseTestRepair, selectPreviousReleaseRun } from './release-quality-reuse.mjs';
import { createPlayRegistration } from '../mobile/mobile-candidate-provenance.mjs';
import { registrationFixture } from '../mobile/mobile-candidate-test-fixtures.mjs';

const repository = 'campfirium/foliole';
const lane = 'release-t7';
const full = fullChainStages(lane);
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commit(cwd, files, message) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), content);
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function repo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-test-repair-'));
  roots.push(cwd);
  git(cwd, 'init', '-q', '-b', 'release');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  git(cwd, 'config', 'user.name', 'Test');
  const base = commit(cwd, { 'src/app/main.ts': 'export const a = 1;\n', 'src/app/main.test.ts': 'it.todo("a");\n',
    'electron/ipc/budget.writes.test.ts': 'it.todo("b");\n', 'src/companion/guard.test-support.mjs': 'export {};\n' }, 'base');
  return { cwd, base };
}

// Mirrors T853 round two: Android source and Electron failed, so the release tail never ran.
function failedNeeds(sha, extra = {}) {
  return Object.fromEntries(full.map(stage => {
    if (stage === 't5-android-source' || stage === 't5-electron') return [stage, { result: 'failure', outputs: {} }];
    if (['t6-desktop-build', 't6-android-web-build', 't6-windows-acceptance', 't6-linux-responsiveness', 't6-android-host']
      .includes(stage)) return [stage, { result: 'skipped', outputs: {} }];
    return [stage, extra[stage] ?? { result: 'success', outputs: { accepted_sha: sha } }];
  }));
}

function releaseEvidence(sha, { id = 45315095202, receipt, conclusion = 'failure' } = {}) {
  return {
    run: { id, run_attempt: 1, status: 'completed', conclusion, path: '.github/workflows/t7-release.yml',
      head_branch: 'release', head_sha: sha, repository: { full_name: repository } },
    artifact: { id: 9, name: `chain-verdict-${id}-1`, expired: false, workflow_run: { id } },
    receipt: receipt ?? createChainVerdict({ selection: 'all', targetSha: sha, needs: failedNeeds(sha), runId: id,
      runAttempt: 1, lane })
  };
}

function decide(cwd, target, evidence) {
  return decideTestRepair({
    evidence, repository, targetSha: target,
    isAncestor: (ancestor, descendant) => {
      try { git(cwd, 'merge-base', '--is-ancestor', ancestor, descendant); return true; } catch { return false; }
    },
    changedFiles: (from, to) => git(cwd, 'diff', '--name-only', '--no-renames', from, to).split('\n').filter(Boolean)
  });
}

describe('release test repair decision', () => {
  it('reruns only the unpassed stages when the candidate changes test files only', () => {
    const { cwd, base } = repo();
    commit(cwd, { 'electron/ipc/budget.writes.test.ts': 'it.todo("b2");\n' }, 'sql budget');
    const target = commit(cwd, { 'src/app/main.test.ts': 'it.todo("a2");\n',
      'src/companion/guard.test-support.mjs': 'export const x = 1;\n' }, 'phone tests');
    const result = decide(cwd, target, releaseEvidence(base));
    expect(result.repair).toBe(true);
    expect(result.stages).toEqual(['t5-android-source', 't5-electron', 't6-desktop-build', 't6-android-web-build',
      't6-windows-acceptance', 't6-linux-responsiveness', 't6-android-host']);
    expect(Object.keys(result.reuse.stages)).toEqual(full.filter(stage => !result.stages.includes(stage)));
    expect(Object.values(result.reuse.stages).every(sha => sha === base)).toBe(true);
    expect(result.reuse).toMatchObject({ run_id: '45315095202', run_attempt: 1, sha: base,
      changed_files: ['electron/ipc/budget.writes.test.ts', 'src/app/main.test.ts', 'src/companion/guard.test-support.mjs'] });
    expect(() => validateChainReuse(result.reuse, { lane, targetSha: target, rerunStages: result.stages })).not.toThrow();
  });

  it.each([
    ['product code', { 'src/app/main.ts': 'export const a = 2;\n' }],
    ['a workflow', { '.github/workflows/t7-release.yml': 'name: x\n' }],
    ['a dependency manifest', { 'package.json': '{}\n' }],
    ['a locale catalog', { 'src/shared/localization/locales/de/companion.json': '{}\n' }],
    ['a test fixture outside the test rule', { 'src/app/fixture.json': '{}\n' }]
  ])('keeps the full chain when the candidate changes %s', (_, files) => {
    const { cwd, base } = repo();
    const target = commit(cwd, { 'src/app/main.test.ts': 'it.todo("a2");\n', ...files }, 'mixed');
    const result = decide(cwd, target, releaseEvidence(base));
    expect(result.repair).toBe(false);
    expect(result.reason).toContain('more than tests');
  });

  it('keeps the full chain for passed, incomplete, foreign or non-ancestor previous runs', () => {
    const { cwd, base } = repo();
    const target = commit(cwd, { 'src/app/main.test.ts': 'it.todo("a2");\n' }, 'test');
    const passedNeeds = Object.fromEntries(full.map(stage => [stage, { result: 'success', outputs: { accepted_sha: base } }]));
    const passed = releaseEvidence(base, { conclusion: 'success',
      receipt: createChainVerdict({ selection: 'all', targetSha: base, needs: passedNeeds, runId: 45315095202, runAttempt: 1, lane }) });
    expect(decide(cwd, target, passed).reason).toContain('not a failed chain');
    const cancelled = releaseEvidence(base, { conclusion: 'cancelled' });
    expect(decide(cwd, target, cancelled).reason).toContain('no trusted full release verdict');
    const devLane = releaseEvidence(base, { receipt: createChainVerdict({ selection: 'all', targetSha: base,
      needs: passedNeeds, runId: 45315095202, runAttempt: 1, lane: 'dev-remote' }) });
    expect(decide(cwd, target, devLane).repair).toBe(false);
    const foreign = releaseEvidence(base);
    foreign.run.repository.full_name = 'other/foliole';
    expect(decide(cwd, target, foreign).repair).toBe(false);
    const side = 'f'.repeat(40);
    expect(decide(cwd, target, releaseEvidence(side)).repair).toBe(false);
    expect(decide(cwd, target, { run: undefined }).repair).toBe(false);
  });

  it('chains a second test repair onto a failed repair run, keeping each stage at its original commit', () => {
    const { cwd, base } = repo();
    const first = commit(cwd, { 'src/app/main.test.ts': 'it.todo("a2");\n' }, 'first repair');
    const firstRepair = decide(cwd, first, releaseEvidence(base));
    // The repair run passes Electron and the tail but Android source fails again.
    const needs = Object.fromEntries(firstRepair.stages.map(stage => [stage, stage === 't5-android-source'
      ? { result: 'failure', outputs: {} } : { result: 'success', outputs: { accepted_sha: first } }]));
    const receipt = createChainVerdict({ selection: firstRepair.stages.join(','), targetSha: first, needs, runId: 45320355778,
      runAttempt: 1, lane, reuse: firstRepair.reuse });
    expect(receipt).toMatchObject({ kind: 'full', verdict: 'failed' });
    const second = commit(cwd, { 'src/companion/guard.test-support.mjs': 'export const y = 2;\n' }, 'second repair');
    const result = decide(cwd, second, releaseEvidence(first, { id: 45320355778, receipt }));
    expect(result.repair).toBe(true);
    expect(result.stages).toEqual(['t5-android-source']);
    expect(result.reuse.stages['t5-static']).toBe(base);
    expect(result.reuse.stages['t5-electron']).toBe(first);
  });

  it('refuses a chained repair when an older reused commit differs in product code', () => {
    const { cwd, base } = repo();
    const product = commit(cwd, { 'src/app/main.ts': 'export const a = 3;\n' }, 'product');
    const needs = failedNeeds(product, { 't5-static': { result: 'success', outputs: { accepted_sha: base } } });
    const rerun = full.filter(stage => stage !== 't5-static');
    const receipt = createChainVerdict({ selection: rerun.join(','), targetSha: product, needs, runId: 5, runAttempt: 1, lane,
      reuse: { run_id: '4', run_attempt: 1, sha: base, changed_files: [], stages: { 't5-static': base } } });
    const target = commit(cwd, { 'src/app/main.test.ts': 'it.todo("z");\n' }, 'test');
    const result = decide(cwd, target, releaseEvidence(product, { id: 5, receipt }));
    expect(result.repair).toBe(false);
    expect(result.reason).toContain('src/app/main.ts');
  });

  it('selects the newest earlier full release run on another commit', () => {
    const sha = n => String(n).repeat(40);
    const run = (id, head, extra = {}) => ({ id, head_sha: head, path: '.github/workflows/t7-release.yml', head_branch: 'release',
      status: 'completed', display_title: `Release (full) @ ${head}`, ...extra });
    const runs = [run(10, sha(1)), run(12, sha(2)), run(13, sha(3), { display_title: `Release (t5-shared) @ ${sha(3)}` }),
      run(14, sha(4), { head_branch: 'dev' }), run(15, sha(5)), run(16, sha(6))];
    expect(selectPreviousReleaseRun(runs, { currentRunId: 16, targetSha: sha(5) })?.id).toBe(12);
    expect(selectPreviousReleaseRun(runs, { currentRunId: 17, targetSha: sha(7) })?.id).toBe(16);
    expect(selectPreviousReleaseRun([], { currentRunId: 17, targetSha: sha(7) })).toBeNull();
  });

  it('reads the previous run through the workflow run listing', () => {
    const { cwd, base } = repo();
    const target = commit(cwd, { 'src/app/main.test.ts': 'it.todo("a2");\n' }, 'test');
    const result = runReleaseTestRepair({ cwd,
      env: { TARGET_SHA: target, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '45320355778' },
      listRuns: () => [{ id: 45315095202, head_sha: base, path: '.github/workflows/t7-release.yml', head_branch: 'release',
        status: 'completed', display_title: `Release (full) @ ${base}` }],
      readEvidence: ({ runId }) => { expect(runId).toBe(45315095202); return releaseEvidence(base); } });
    expect(result.repair).toBe(true);
  });
});

describe('reusing chain verdict', () => {
  const target = 'a'.repeat(40);
  const base = 'b'.repeat(40);
  const rerun = ['t5-android-source', 't5-electron'];
  const reuse = { run_id: '7', run_attempt: 1, sha: base, changed_files: ['x.test.ts'],
    stages: Object.fromEntries(full.filter(stage => !rerun.includes(stage)).map(stage => [stage, base])) };
  const rerunNeeds = Object.fromEntries(rerun.map(stage => [stage, { result: 'success', outputs: { accepted_sha: target } }]));
  const create = (overrides = {}) => createChainVerdict({ selection: rerun.join(','), targetSha: target, needs: rerunNeeds,
    runId: 8, runAttempt: 1, lane, reuse, ...overrides });

  it('records a full release verdict with every reused stage at its ancestor', () => {
    const receipt = create();
    expect(receipt).toMatchObject({ kind: 'full', verdict: 'passed', accepted_sha: target, reused: reuse });
    expect(receipt.stage_shas['t5-static']).toBe(base);
    expect(receipt.stage_shas['t5-electron']).toBe(target);
    const evidence = { run: { id: 8, run_attempt: 1, status: 'completed', conclusion: 'success' },
      artifact: { name: 'chain-verdict-8-1', expired: false, workflow_run: { id: 8 } }, receipt, targetSha: target };
    expect(consumeChainVerdict(evidence).accepted_sha).toBe(target);
    const forged = structuredClone(evidence);
    forged.receipt.stage_shas['t5-static'] = 'c'.repeat(40);
    expect(consumeChainVerdict(forged).verdict).not.toBe('passed');
    const devLane = structuredClone(evidence);
    devLane.receipt.lane = 'dev-remote';
    expect(consumeChainVerdict(devLane).verdict).toBe('incomplete');
  });

  it('fails when a rerun stage fails or misses the target', () => {
    expect(create({ needs: { ...rerunNeeds, 't5-electron': { result: 'failure', outputs: {} } } }).verdict).toBe('failed');
    expect(create({ needs: { ...rerunNeeds, 't5-electron': { result: 'success', outputs: { accepted_sha: base } } } }))
      .not.toHaveProperty('accepted_sha');
  });

  it.each([
    ['a dev lane', { lane: 'dev-remote' }],
    ['the all selection', { selection: 'all' }],
    ['overlapping stages', { selection: [...rerun, 't5-static'].join(',') }],
    ['an uncovered stage', { selection: 't5-electron' }],
    ['reuse at the target itself', { reuse: { ...reuse, sha: target } }],
    ['a reused stage at the target', { reuse: { ...reuse, stages: { ...reuse.stages, 't5-static': target } } }]
  ])('rejects %s', (_, overrides) => {
    expect(() => create(overrides)).toThrow();
  });

  it('lets the release Play registration accept the same-run repair verdict but no reuse elsewhere', () => {
    const f = registrationFixture(lane);
    const sha = f.run.head_sha;
    const stages = Object.fromEntries(full.filter(stage => !rerun.includes(stage)).map(stage => [stage, base]));
    f.quality = createChainVerdict({ selection: rerun.join(','), targetSha: sha, runId: '42', runAttempt: 1, lane,
      needs: Object.fromEntries(rerun.map(stage => [stage, { result: 'success', outputs: { accepted_sha: sha } }])),
      reuse: { ...reuse, stages } });
    expect(createPlayRegistration(f)).toMatchObject({ lane, sourceSha: sha });
    const tampered = structuredClone(f);
    tampered.quality.stage_shas['t5-static'] = 'c'.repeat(40);
    expect(() => createPlayRegistration(tampered)).toThrow();
    const dev = registrationFixture('dev-remote');
    dev.quality.reused = { ...reuse, stages };
    expect(() => createPlayRegistration(dev)).toThrow();
  });
});
