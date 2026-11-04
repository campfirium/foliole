/* global console, process */
import { realpathSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { readChainVerdict } from './chain-verdict-read.mjs';
import { runQaMobileResume } from './qa-mobile-resume.mjs';
import { monitorRemoteQualityJobs, requireSuccess } from './remote-quality-monitor.mjs';
import { parseRemoteQualityRun } from './remote-quality-run-title.mjs';
import { QA_BRANCH, qaGit, qaRecordPath, qaWorkspaceEnvironment, readQaWorkspace } from './qa-workspace-state.mjs';

function saveRun(cwd, run) {
  const record = readQaWorkspace(cwd);
  delete record.head;
  delete record.dispatchPending;
  writeFileSync(qaRecordPath(cwd), `${JSON.stringify({ ...record, run }, null, 2)}\n`);
}

export async function qaPreflightBase({ cwd, repo, runner, targetSha, scope }) {
  for (const branch of [QA_BRANCH, 'dev']) {
    const runs = JSON.parse(await requireSuccess(runner, 'gh', ['api',
      `repos/${repo}/actions/workflows/remote-quality.yml/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=50`,
      '--jq', '.workflow_runs'], { cwd }));
    for (const run of runs) {
      const parsed = parseRemoteQualityRun(run);
      if (!parsed || ![scope, 'full'].includes(parsed.scope)) continue;
      const ancestor = await runner('git', ['merge-base', '--is-ancestor', parsed.testedSha, targetSha], { cwd });
      if (ancestor.code === 0) return parsed.testedSha;
    }
  }
  throw new Error('QA has no verified ancestor for this scope; preserve the candidate and resolve its baseline');
}

async function runPreflight({ record, base, targetSha, scope }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(record.worktreePath,
      'scripts/quality/qa-remote-preflight.mjs'), base, targetSha, scope], {
      cwd: record.worktreePath, env: qaWorkspaceEnvironment(record, process.env), stdio: 'inherit', shell: false
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('QA local preflight failed; no hosted run dispatched')));
  });
}

async function selectQaRun({ cwd, repo, runner, targetSha, scope, record, mobileDistribution }) {
  const matches = run => (run.mobileDistribution ?? '') === (mobileDistribution ?? '');
  if (record.run?.targetSha === targetSha && record.run.scope === scope && matches(record.run)) return record.run;
  if (record.dispatchPending && !matches(record.dispatchPending)) {
    throw new Error('Pending QA distribution choice differs; recover the original request first');
  }
  const { workflow_runs: runs } = JSON.parse(await requireSuccess(runner, 'gh', ['api',
    `repos/${repo}/actions/workflows/remote-quality.yml/runs?branch=${encodeURIComponent(QA_BRANCH)}&per_page=50`], { cwd }));
  if (record.dispatchPending) {
    const recovered = runs.find(run => run.head_branch === QA_BRANCH && run.head_sha === targetSha
      && parseRemoteQualityRun(run)?.scope === scope && matches(parseRemoteQualityRun(run)) && run.created_at >= record.dispatchPending.startedAt);
    if (!recovered) throw new Error('Pending QA dispatch has no identified run; verify delivery before retrying');
    const saved = { runId: recovered.id, targetSha, scope, url: recovered.html_url,
      ...(mobileDistribution ? { mobileDistribution } : {}) };
    saveRun(cwd, saved);
    return saved;
  }
  const active = runs.filter(run => run.head_branch === QA_BRANCH && run.status !== 'completed');
  const existing = active.find(run => run.head_sha === targetSha
    && [scope, 'full'].includes(parseRemoteQualityRun(run)?.scope) && matches(parseRemoteQualityRun(run)));
  if (!existing && active.length) throw new Error(`QA already has an active run: ${active[0].html_url}`);
  return existing ? { runId: existing.id, targetSha,
    scope: parseRemoteQualityRun(existing).scope, url: existing.html_url,
    ...(mobileDistribution ? { mobileDistribution } : {}) } : null;
}

async function dispatchQaRun({ cwd, repo, runner, scope, targetSha, mobileDistribution }) {
  const distribution = mobileDistribution ? { mobileDistribution } : {};
  const payload = { ref: QA_BRANCH, inputs: { scope, target_sha: targetSha, trigger_short: targetSha.slice(0, 9),
    ...(mobileDistribution ? { mobile_distribution: mobileDistribution } : {}) } };
  const record = readQaWorkspace(cwd);
  delete record.head;
  writeFileSync(qaRecordPath(cwd), `${JSON.stringify({ ...record,
    dispatchPending: { targetSha, scope, ...distribution, startedAt: new Date().toISOString() } }, null, 2)}\n`);
  const result = JSON.parse(await requireSuccess(runner, 'gh', ['api', '--method', 'POST',
    '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repo}/actions/workflows/remote-quality.yml/dispatches`, '--input', '-'],
  { cwd, input: JSON.stringify(payload) }));
  if (!result.workflow_run_id || !result.html_url) throw new Error('QA dispatch returned no run identity; recover before redispatch');
  return { runId: result.workflow_run_id, url: result.html_url, scope, targetSha, ...distribution };
}

export async function runQaRemoteQuality({ args, cwd, repo, runner, preflight = runPreflight,
  readVerdict = readChainVerdict, monitor = monitorRemoteQualityJobs, ...waitOptions }) {
  if (args.mobileQualityRunId) return runQaMobileResume({ args, cwd, repo, runner, monitor, ...waitOptions });
  if (args.replay || args.skipPreflight || args.preflightHost === 'windows') {
    throw new Error('QA uses Mac preflight and explicit scopes; replay and preflight bypass are unavailable');
  }
  if (args.mobileDistribution && (!['ios', 'android'].includes(args.mobileDistribution) || args.scope !== 'full')) {
    throw new Error('Mobile distribution requires full QA and an enabled platform (ios or android)');
  }
  const record = readQaWorkspace(cwd);
  if (record.phase !== 'prepared' || realpathSync(cwd) !== realpathSync(record.worktreePath)) {
    throw new Error('Run QA quality from its registered prepared workspace');
  }
  if (qaGit(cwd, 'status', '--porcelain', '--untracked-files=all')) throw new Error('Commit QA repairs before dispatch');
  const targetSha = qaGit(cwd, 'rev-parse', 'HEAD');
  let run = await selectQaRun({ cwd, repo, runner, targetSha, scope: args.scope, record,
    mobileDistribution: args.mobileDistribution });
  if (!run) {
    const base = await qaPreflightBase({ cwd, repo, runner, targetSha, scope: args.scope });
    await preflight({ record, base, targetSha, scope: args.scope });
    if (qaGit(cwd, 'rev-parse', 'HEAD') !== targetSha || qaGit(cwd, 'status', '--porcelain')) {
      throw new Error('QA changed during preflight; no hosted run dispatched');
    }
    await requireSuccess(runner, 'git', ['push', 'origin', `HEAD:refs/heads/${QA_BRANCH}`], { cwd });
    run = await dispatchQaRun({ cwd, repo, runner, scope: args.scope, targetSha, mobileDistribution: args.mobileDistribution });
    saveRun(cwd, run);
  }
  console.log(`[qa-quality] ${run.scope} ${run.targetSha}: ${run.url}`);
  const identity = JSON.parse(await requireSuccess(runner, 'gh', ['api', `repos/${repo}/actions/runs/${run.runId}`], { cwd }));
  if (identity.head_branch !== QA_BRANCH || identity.head_sha !== targetSha) {
    throw new Error('QA run identity differs from its candidate; preserve both for recovery');
  }
  const result = await monitor({ cwd, repo, runner, runId: run.runId, ...waitOptions });
  if (result.failed) throw new Error(`QA ${args.scope} failed: ${run.url}`);
  if (run.scope === 'full') {
    const receipt = await readVerdict({ repository: repo, runId: run.runId, targetSha });
    if (receipt.kind !== 'full' || receipt.verdict !== 'passed' || receipt.accepted_sha !== targetSha) {
      throw new Error('QA full lacks a matching complete chain receipt');
    }
  }
  saveRun(cwd, { ...run, passed: true });
  return { ...run, sourceRef: `refs/heads/${QA_BRANCH}`, jobs: result.jobs };
}
