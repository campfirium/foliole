import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { allPages } from '../mobile/mobile-candidate-read.mjs';
import { verifyPlayQuality, verifyPlaySource } from '../mobile/mobile-candidate-provenance.mjs';
import { readReceipt } from '../quality/chain-verdict-read.mjs';

export const PLAY_ADMISSION_JOB = 'Admit Android submission or wait for review';

export const PLAY_UPLOAD_ADMISSION_JOB = 'Admit prepared Android upload or wait for review';

export async function readPlayQueueEvidence(github, runId, jobName = PLAY_ADMISSION_JOB) {
  if (!/^[1-9]\d*$/u.test(String(runId))) throw new Error('Exact queued source run is required');
  const base = `actions/runs/${runId}`;
  const run = await github('GET', base);
  verifyPlaySource(run);
  const artifacts = await allPages(github, `${base}/artifacts`, 'artifacts');
  const matches = artifacts.filter(item => !item.expired &&
    new RegExp(`^chain-verdict-${runId}-[1-9]\\d*$`, 'u').test(item.name))
    .sort((a, b) => Number(b.name.split('-').at(-1)) - Number(a.name.split('-').at(-1)));
  const artifact = matches[0];
  if (!artifact) throw new Error('Queued full quality evidence is missing or expired');
  const bytes = await github('GET', `actions/artifacts/${artifact.id}/zip`, undefined, true);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== artifact.digest) {
    throw new Error('Queued quality archive digest differs');
  }
  const quality = readReceipt(bytes);
  const jobs = await allPages(github, `${base}/attempts/${quality.run_attempt}/jobs`, 'jobs');
  const { lane, accepted } = verifyPlayQuality({ run, qualityArtifact: artifact, quality, jobs });
  const currentJobs = await allPages(github, `${base}/attempts/${run.run_attempt}/jobs`, 'jobs');
  const admission = currentJobs.filter(job => job.name === jobName || job.name.endsWith(` / ${jobName}`));
  if (admission.length !== 1 || !Number.isSafeInteger(admission[0].id)) throw new Error('Exact Android admission job is missing');
  const pkg = await github('GET', `contents/package.json?ref=${run.head_sha}`);
  if (pkg.encoding !== 'base64') throw new Error('Queued source package is unavailable');
  const version = JSON.parse(Buffer.from(pkg.content, 'base64').toString()).version;
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('Queued source version is invalid');
  const latest = await github('GET', base);
  if (latest.head_sha !== run.head_sha || latest.run_attempt !== run.run_attempt || latest.status !== run.status) {
    throw new Error('Queued source run changed during verification');
  }
  return { run, lane, version, jobId: admission[0].id, qualityArtifact: accepted };
}
