/* global console, setTimeout */

const PASSING_JOB_CONCLUSIONS = new Set(['neutral', 'skipped', 'success']);
const POLL_INTERVAL_MS = 15_000;

export async function requireSuccess(runner, command, args, options = {}) {
  const result = await runner(command, args, options);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout.trim();
}

function parseJobs(value) {
  const parsed = JSON.parse(value);
  const pages = Array.isArray(parsed) ? parsed : [parsed];
  if (pages.some((page) => !Array.isArray(page.jobs))) {
    throw new Error('GitHub jobs response did not contain a jobs array');
  }
  return pages.flatMap((page) => page.jobs);
}

function parseWorkflowRun(value) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GitHub workflow run response was not an object');
  }
  return parsed;
}

function isFailedJob(job) {
  return job.status === 'completed' && !PASSING_JOB_CONCLUSIONS.has(job.conclusion);
}

async function emitFailedJobLog(runner, repo, job, cwd) {
  console.error(`[remote-quality] failed job: ${job.name} (${job.html_url ?? job.id})`);
  return runner('gh', [
    'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repo}/actions/jobs/${job.id}/logs`
  ], { capture: false, cwd });
}

export async function monitorRemoteQualityJobs(options) {
  const { cwd, repo, runId, runner } = options;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const wait = options.wait ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  const emittedFailures = new Set();
  while (true) {
    const [runStdout, jobsStdout] = await Promise.all([
      requireSuccess(runner, 'gh', [
        'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
        `repos/${repo}/actions/runs/${runId}`
      ], { cwd }),
      requireSuccess(runner, 'gh', [
        'api', '-H', 'X-GitHub-Api-Version: 2026-03-10',
        '--paginate', '--slurp', `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`
      ], { cwd })
    ]);
    const run = parseWorkflowRun(runStdout);
    const jobs = parseJobs(jobsStdout);
    for (const job of jobs.filter(isFailedJob)) {
      if (emittedFailures.has(job.id)) continue;
      const log = await emitFailedJobLog(runner, repo, job, cwd);
      if (log.code === 0) emittedFailures.add(job.id);
    }
    if (run.status === 'completed') {
      return { failed: run.conclusion !== 'success', jobs, run };
    }
    await wait(pollIntervalMs);
  }
}
