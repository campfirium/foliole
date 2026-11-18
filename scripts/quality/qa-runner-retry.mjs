/* global console */
import { setTimeout as delay } from 'node:timers/promises';
import { requireSuccess } from './remote-quality-monitor.mjs';

const RETRY_DELAYS_MINUTES = [5, 15, 30, 60];
const PASSING_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const FULL_VERDICT_JOB = 'full-quality / quality-admission / verdict';
const NO_RUNNER = /^The job was not acquired by Runner of type hosted even after multiple attempts\.?$/iu;

async function missedHostedRunner({ job, cwd, repo, runner }) {
  if (!['failure', 'cancelled'].includes(job.conclusion) || job.runner_id || job.steps?.length !== 0) return false;
  const annotations = JSON.parse(await requireSuccess(runner, 'gh', ['api',
    `repos/${repo}/check-runs/${job.id}/annotations`], { cwd }));
  const failures = annotations.filter(annotation => annotation.annotation_level === 'failure');
  return failures.length > 0 && failures.every(annotation => NO_RUNNER.test(annotation.message));
}

async function capacityFailures(result, context) {
  if (!result.failed || result.run?.conclusion !== 'failure'
    || !Number.isInteger(result.run.run_attempt) || result.run.run_attempt < 1) return [];
  if (!result.jobs.length || result.jobs.some(job => job.status !== 'completed')) return [];
  // The full verdict fails when a required job never starts. Classify the underlying jobs.
  const failed = result.jobs.filter(job => !PASSING_CONCLUSIONS.has(job.conclusion) && job.name !== FULL_VERDICT_JOB);
  const missed = await Promise.all(failed.map(job => missedHostedRunner({ ...context, job })));
  return missed.every(Boolean) ? failed : [];
}

async function readCurrentRun({ cwd, repo, runner, runId, targetSha, branch }) {
  const run = JSON.parse(await requireSuccess(runner, 'gh', ['api',
    `repos/${repo}/actions/runs/${runId}`], { cwd }));
  if (run.head_sha !== targetSha || run.head_branch !== branch) {
    throw new Error('QA run identity changed while waiting to retry runner allocation');
  }
  return run;
}

export async function waitForQaWithRunnerRetries({ monitor, retryWait = delay, assertCandidate,
  targetSha, branch, ...options }) {
  let minimumAttempt;
  while (true) {
    const result = await monitor({ ...options, minimumAttempt });
    const failed = await capacityFailures(result, options);
    if (!failed.length) return result;
    const attempt = result.run.run_attempt;
    const minutes = RETRY_DELAYS_MINUTES[Math.min(attempt - 1, RETRY_DELAYS_MINUTES.length - 1)];
    const remaining = Math.max(0, minutes * 60_000 - Math.max(0, Date.now() - Date.parse(result.run.updated_at)));
    console.log(`[qa-quality] ${failed.length} job(s) missed a hosted runner in attempt ${attempt}; retry after ${minutes}m backoff`);
    await retryWait(Number.isFinite(remaining) ? remaining : minutes * 60_000);
    assertCandidate();
    const current = await readCurrentRun({ ...options, targetSha, branch });
    if (current.run_attempt !== attempt || current.status !== 'completed' || current.conclusion !== 'failure') continue;
    const { cwd, repo, runner, runId } = options;
    await requireSuccess(runner, 'gh', ['run', 'rerun', String(runId), '-R', repo, '--failed'], { cwd });
    minimumAttempt = attempt + 1;
  }
}
