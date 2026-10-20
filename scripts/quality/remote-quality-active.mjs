import { testedSha } from './remote-quality-replay.mjs';

const ACTIVE_RUN_STATUSES = new Set(['in_progress', 'pending', 'queued', 'requested', 'waiting']);
const SCHEDULED_PATH = '.github/workflows/t7-hosted-quality.yml';
const SCHEDULED_SKIP_JOB = 'Scheduled dev run skipped';

export function findActiveHostedQualityRuns(workflowRuns, branch) {
  return workflowRuns.flat().filter((run) => (
    run.head_branch === branch && ACTIVE_RUN_STATUSES.has(run.status)
  ));
}

// Only a complete chain may stand in for a full or replay request; replay and
// narrow-scope runs cover a subset of the stages.
export function isFullChainRun(run) {
  return run.path === SCHEDULED_PATH
    || /^Scheduled Dev Quality @ /u.test(run.display_title ?? '')
    || /^Dev Quality Check \(full\) @ /u.test(run.display_title ?? '');
}

function exactTestedSha(run) {
  try {
    return testedSha(run);
  } catch {
    return null;
  }
}

// A run of another commit still counts when it tests the same source tree.
export async function findCoveringFullRun({ runs, targetSha, treeOf }) {
  const candidates = runs.filter(isFullChainRun)
    .map((run) => ({ run, sha: exactTestedSha(run) }))
    .filter(({ sha }) => /^[0-9a-f]{40}$/u.test(sha ?? ''));
  const exact = candidates.find(({ sha }) => sha === targetSha);
  if (exact) return exact.run;
  const targetTree = candidates.length ? await treeOf(targetSha) : null;
  if (!targetTree) return null;
  for (const { run, sha } of candidates) {
    if (await treeOf(sha) === targetTree) return run;
  }
  return null;
}

// The scheduled admission may still decline to run once it starts, which
// concludes successfully without testing anything.
export function scheduledRunSkipped(jobs) {
  return jobs.some((job) => job.name === SCHEDULED_SKIP_JOB && job.conclusion === 'success');
}

export async function awaitCoveringFullRun({ listRuns, log, monitor, targetSha, treeOf }) {
  const run = await findCoveringFullRun({ runs: await listRuns(), targetSha, treeOf });
  if (!run) return null;
  const url = run.html_url ?? String(run.id);
  log(`[remote-quality] full chain for ${targetSha} already active; waiting instead of dispatching: ${url}`);
  const result = await monitor(run.id);
  if (scheduledRunSkipped(result.jobs)) {
    log(`[remote-quality] active scheduled run ${url} declined to run; dispatching instead`);
    return null;
  }
  return { ...result, runId: run.id, url };
}
