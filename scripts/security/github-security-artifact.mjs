import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GH_EXECUTABLE } from '../github-monitor-gh.mjs';
import { digest } from './security-inputs.mjs';

const repository = 'campfirium/foliole';
export function securityGithubApi(endpoint, binary = false) {
  const bytes = execFileSync(GH_EXECUTABLE, ['api', endpoint], { encoding: binary ? undefined : 'utf8',
    timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  return binary ? bytes : JSON.parse(bytes);
}

export function verifiedSecurityRun(run, candidate) {
  if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || run.head_repository?.id !== run.repository?.id
    || run.path !== '.github/workflows/t7-hosted-quality.yml' || run.head_branch !== 'dev'
    || run.status !== 'completed' || !['schedule', 'workflow_dispatch'].includes(run.event)
    || String(run.id) !== String(candidate.databaseId) || run.head_sha !== candidate.headSha
    || !/^[a-f0-9]{40}$/u.test(run.head_sha) || !Number.isInteger(run.run_attempt) || run.run_attempt < 1) {
    throw new Error('Security source is not a verified completed dev scheduled workflow');
  }
  return run;
}

export function verifiedSecurityArtifact(run, artifacts) {
  const expected = `security-maintenance-${run.head_sha}-${run.run_attempt}`;
  const matches = artifacts.filter(artifact => artifact.name === expected);
  if (matches.length !== 1) throw new Error('Missing or duplicate security artifact for current run attempt');
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact.id) || artifact.expired || !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? '')
    || artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== run.head_sha
    || artifact.workflow_run?.head_branch !== 'dev'
    || artifact.workflow_run?.repository_id !== run.repository.id
    || artifact.workflow_run?.head_repository_id !== run.repository.id) {
    throw new Error('Security artifact provenance or integrity metadata mismatch');
  }
  return artifact;
}

export function readSecurityArchive(bytes, artifact, directory, extract = (file, name) =>
  execFileSync('unzip', ['-p', file, name], { encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024 * 1024 })) {
  if (`sha256:${digest(bytes)}` !== artifact.digest) throw new Error('Security artifact ZIP digest mismatch');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${artifact.id}.zip`);
  writeFileSync(file, bytes, { mode: 0o600 });
  let rawReport;
  try { rawReport = extract(file, 'coverage.json'); }
  catch {
    // A setup failure artifact has no report. Its explicit failure is never imported as clean.
    const failure = JSON.parse(extract(file, 'failure.json'));
    throw new Error(`Security collection failed: ${failure.reason ?? 'report unavailable'}`);
  }
  JSON.parse(rawReport);
  return rawReport;
}
