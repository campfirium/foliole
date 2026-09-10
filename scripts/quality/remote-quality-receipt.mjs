import fs from 'node:fs';
import path from 'node:path';

const SHA_STEP_NAME = 'Verify target SHA';

function shaChecks(jobs) {
  return jobs.flatMap((job) => (job.steps ?? [])
    .filter((step) => step.name === SHA_STEP_NAME)
    .map((step) => ({
      conclusion: step.conclusion,
      jobId: job.id,
      jobName: job.name,
      jobUrl: job.html_url,
      status: step.status
    })));
}

export function writeRemoteQualityReceipt({ cwd, jobs, runId, scope, sourceRef, targetSha, url }) {
  if (sourceRef !== 'refs/heads/sync') return null;
  const checks = shaChecks(jobs);
  if (checks.length === 0 || checks.some((check) => (
    check.status !== 'completed' || check.conclusion !== 'success'
  ))) {
    throw new Error('Remote sync quality did not report a successful target SHA verification step');
  }
  const root = path.join(cwd, '.tmp', 'artifacts', 't173-sync-hosted-quality', targetSha);
  const receiptPath = path.join(root, `${scope}-receipt.json`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify({
    dispatchRef: 'refs/heads/dev',
    resultStatus: 'success',
    runId,
    runUrl: url,
    schemaVersion: 1,
    scope,
    shaChecks: checks,
    sourceRef,
    targetSha
  }, null, 2)}\n`, 'utf8');
  return receiptPath;
}
