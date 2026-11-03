/* global process */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseRemoteQualityRun } from '../quality/remote-quality-run-title.mjs';
import { readChainEvidence, readReceipt } from '../quality/chain-verdict-read.mjs';
import { verifyMobileEvidenceIdentity, verifyMobileQualitySource, verifyUnchangedMobileProduct } from './mobile-beta-evidence.mjs';

export function mobileEvidenceApi(endpoint, binary = false) {
  return execFileSync('gh', ['api', endpoint], { encoding: binary ? undefined : 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

export function readMobileQualityEvidence({ repository, qualityRunId, cwd, sourceSha, distributionRunId,
  api = mobileEvidenceApi, readChain = readChainEvidence }) {
  const quality = readChain({ repository, runId: qualityRunId, api });
  const base = `repos/${repository}/actions`;
  const result = JSON.parse(api(`${base}/runs/${qualityRunId}/jobs?per_page=100`));
  if (result.total_count !== result.jobs.length) throw new Error('Quality job inventory is incomplete');
  const accepted = verifyMobileQualitySource({ ...quality, jobs: result.jobs, repository });
  const product = verifyUnchangedMobileProduct({ cwd, sourceSha, qualitySourceSha: accepted.qualitySourceSha });
  return { schemaVersion: 1, kind: 'mobile-quality-reuse', sourceSha,
    distributionRunId: String(distributionRunId), ...accepted, ...product };
}

export function readMobileResumeEvidence({ repository, runId, sourceSha, cwd, api = mobileEvidenceApi,
  decode = readReceipt, readChain = readChainEvidence }) {
  const base = `repos/${repository}/actions`;
  const run = JSON.parse(api(`${base}/runs/${runId}`));
  if (run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== sourceSha ||
      run.head_branch !== 'check' || run.event !== 'workflow_dispatch' ||
      (run.path !== '.github/workflows/remote-quality.yml' || parseRemoteQualityRun(run)?.scope !== 'mobile_resume') || run.head_repository?.full_name !== repository) {
    throw new Error('Mobile resume is not a matching successful run');
  }
  const { artifacts } = JSON.parse(api(`${base}/runs/${runId}/artifacts?per_page=100`));
  const matching = artifacts.filter(artifact => {
    const attempt = artifact.name?.match(new RegExp(`^mobile-quality-reuse-${runId}-([1-9]\\d*)$`, 'u'))?.[1];
    return attempt && Number(attempt) <= run.run_attempt && !artifact.expired &&
      String(artifact.workflow_run?.id) === String(runId);
  });
  const latest = Math.max(...matching.map(artifact => Number(artifact.name.split('-').at(-1))));
  const matches = matching.filter(artifact => Number(artifact.name.split('-').at(-1)) === latest);
  if (matches.length !== 1) throw new Error('Mobile resume evidence is missing or expired');
  const evidence = verifyMobileEvidenceIdentity(decode(api(`${base}/artifacts/${matches[0].id}/zip`, true),
    'mobile-quality-evidence.json'), { sourceSha, runId });
  if (parseRemoteQualityRun(run)?.qualityRunId !== evidence.qualityRunId) {
    throw new Error('Mobile resume quality origin differs from its run identity');
  }
  const verified = readMobileQualityEvidence({ repository, qualityRunId: evidence.qualityRunId,
    cwd, sourceSha, distributionRunId: runId, api, readChain });
  if (JSON.stringify(verified) !== JSON.stringify(evidence)) throw new Error('Mobile quality evidence changed');
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (process.env.GITHUB_REF !== 'refs/heads/check' || sourceSha !== process.env.GITHUB_SHA) {
    throw new Error('Mobile evidence must use the exact registered QA workflow source');
  }
  const evidence = readMobileQualityEvidence({ cwd: process.cwd(), sourceSha,
    repository: process.env.GITHUB_REPOSITORY, qualityRunId: process.env.FOLIOLE_MOBILE_QUALITY_RUN_ID,
    distributionRunId: process.env.GITHUB_RUN_ID });
  const directory = '.tmp/artifacts/mobile-quality-reuse';
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'mobile-quality-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}
