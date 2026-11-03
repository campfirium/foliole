/* global console */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { normalizeSpawnCommand } from '../lib/spawn-command.mjs';
import { realpathSync } from 'node:fs';
import { readMobileQualityEvidence, readMobileResumeEvidence } from '../ios/mobile-beta-evidence-read.mjs';
import { requireSuccess, monitorRemoteQualityJobs } from './remote-quality-monitor.mjs';
import { parseRemoteQualityRun } from './remote-quality-run-title.mjs';
import { qaGit, readQaWorkspace } from './qa-workspace-state.mjs';
import { saveQaRecord } from './qa-workspace-integration.mjs';
import { runQaWorkspaceCommand } from './qa-workspace.mjs';

export const MOBILE_RESUME_TESTS = [
  'scripts/quality/mobile-beta-evidence.test.mjs', 'scripts/quality/qa-mobile-resume.test.mjs',
  'scripts/quality/remote-quality.test.mjs', 'scripts/quality/remote-quality-run-title.test.mjs',
  'scripts/quality/qa-workspace-integration.test.mjs', 'scripts/quality/chain-verdict-read.test.mjs',
  'scripts/ios/testflight-contract.test.mjs', 'scripts/ios/testflight-workflow.test.mjs',
  'scripts/ios/testflight-build-number.test.mjs', 'scripts/ios/testflight-distribution.test.mjs',
  'scripts/ios/testflight-release-assets.test.mjs'
];

async function preflight(record) {
  const code = await runQaWorkspaceCommand({ repoRoot: record.devRoot,
    command: ['npm', 'run', 'test:files', '--', ...MOBILE_RESUME_TESTS] });
  if (code !== 0) throw new Error('Affected distribution checks failed; no resume dispatched');
}

export async function runQaMobileResume({ args, cwd, repo, runner, monitor = monitorRemoteQualityJobs,
  readQuality = readMobileQualityEvidence, readCompleted = readMobileResumeEvidence,
  validate = preflight, ...waitOptions }) {
  const record = readQaWorkspace(cwd);
  if (record.phase !== 'prepared' || realpathSync(cwd) !== realpathSync(record.worktreePath) ||
      args.scope !== 'full' || args.mobileDistribution !== 'ios' || args.skipPreflight || args.replay) {
    throw new Error('Mobile resume requires the owning prepared QA workspace and explicit ios distribution');
  }
  if (qaGit(cwd, 'status', '--porcelain', '--untracked-files=all')) throw new Error('Commit distribution repairs before resuming');
  const sourceSha = qaGit(cwd, 'rev-parse', 'HEAD');
  const qualityRunId = args.mobileQualityRunId;
  const selected = await selectMobileResume({ record, sourceSha, qualityRunId, cwd, repo, runner, readQuality, validate });
  console.log(`[qa-mobile-resume] ${sourceSha} reuses quality ${qualityRunId}: ${selected.url}`);
  const identity = JSON.parse(await requireSuccess(runner, 'gh', ['api', `repos/${repo}/actions/runs/${selected.runId}`], { cwd }));
  if (identity.head_branch !== 'check' || identity.head_sha !== sourceSha ||
      parseRemoteQualityRun(identity)?.qualityRunId !== qualityRunId) throw new Error('Mobile run identity differs');
  const result = await monitor({ cwd, repo, runner, runId: selected.runId, ...waitOptions });
  if (result.failed) throw new Error(`Mobile distribution failed: ${selected.url}`);
  readCompleted({ repository: repo, runId: selected.runId, sourceSha, cwd });
  record.run = { ...selected, passed: true };
  saveQaRecord(record);
  return record.run;
}

async function selectMobileResume({ record, sourceSha, qualityRunId, cwd, repo, runner, readQuality, validate }) {
  const same = run => run?.scope === 'mobile-resume' && run.targetSha === sourceSha && run.qualityRunId === qualityRunId;
  let selected = same(record.run) ? record.run : null;
  if (!selected) {
    const { workflow_runs: runs } = JSON.parse(await requireSuccess(runner, 'gh', ['api',
      `repos/${repo}/actions/workflows/remote-quality.yml/runs?branch=check&per_page=50`], { cwd }));
    const matches = run => run.head_sha === sourceSha && parseRemoteQualityRun(run)?.scope === 'mobile_resume' &&
      parseRemoteQualityRun(run)?.qualityRunId === qualityRunId;
    if (record.dispatchPending) {
      if (record.dispatchPending.kind !== 'mobile-resume' || record.dispatchPending.qualityRunId !== qualityRunId ||
          record.dispatchPending.targetSha !== sourceSha) throw new Error('Recover the original pending dispatch first');
      const recovered = runs.find(run => matches(run) && run.created_at >= record.dispatchPending.startedAt);
      if (!recovered) throw new Error('Pending mobile dispatch has no identified run; verify delivery before retrying');
      selected = resumeRun(recovered.id, recovered.html_url, sourceSha, qualityRunId);
    } else {
      const active = runs.filter(run => run.status !== 'completed');
      const existing = active.find(matches);
      if (active.length && !existing) throw new Error('Another QA run is active; preserve the existing delivery');
      if (existing) selected = resumeRun(existing.id, existing.html_url, sourceSha, qualityRunId);
    }
    if (!selected) {
      readQuality({ repository: repo, qualityRunId, cwd, sourceSha, distributionRunId: 'local-preflight' });
      await validate(record);
      if (qaGit(cwd, 'rev-parse', 'HEAD') !== sourceSha || qaGit(cwd, 'status', '--porcelain')) {
        throw new Error('QA changed during distribution checks');
      }
      await requireSuccess(runner, 'git', ['push', 'origin', 'HEAD:refs/heads/check'], { cwd });
      record.dispatchPending = { kind: 'mobile-resume', targetSha: sourceSha, qualityRunId, startedAt: new Date().toISOString() };
      saveQaRecord(record);
      const response = JSON.parse(await requireSuccess(runner, 'gh', ['api', '--method', 'POST',
        `repos/${repo}/actions/workflows/remote-quality.yml/dispatches`, '--input', '-'], { cwd,
        input: JSON.stringify({ ref: 'check', inputs: { scope: 'full', target_sha: sourceSha,
          trigger_short: sourceSha.slice(0, 9), mobile_distribution: 'ios', mobile_quality_run_id: qualityRunId } }) }));
      if (!response.workflow_run_id || !response.html_url) throw new Error('Dispatch response is unknown; recover it before retrying');
      selected = resumeRun(response.workflow_run_id, response.html_url, sourceSha, qualityRunId);
    }
    delete record.dispatchPending;
    record.run = selected;
    saveQaRecord(record);
  }
  return selected;
}

function resumeRun(runId, url, targetSha, qualityRunId) {
  return { runId, url, targetSha, qualityRunId, scope: 'mobile-resume', mobileDistribution: 'ios' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv[2] !== '--contracts') throw new Error('Use --contracts for affected distribution checks');
  const { bin, args } = normalizeSpawnCommand(['npm', 'run', 'test:files', '--', ...MOBILE_RESUME_TESTS]);
  const result = spawnSync(bin, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
