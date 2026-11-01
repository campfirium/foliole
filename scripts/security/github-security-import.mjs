import path from 'node:path';
import { Buffer } from 'node:buffer';
import { importSecurityObservation } from './security-owner.mjs';
import { readOwnerRecords } from './security-owner-files.mjs';
import { recordOwnerHealth } from './security-owner-health.mjs';
import { securityGithubApi, verifiedSecurityRun, verifiedSecurityArtifact, readSecurityArchive } from './github-security-artifact.mjs';

export function refreshGithubSecurityOwner(workspace, candidate, options = {}) {
  const owner = path.join(workspace, '.lab/internal/security-maintenance');
  const now = options.now ?? Date.now();
  const api = options.api ?? securityGithubApi;
  try {
    if (!candidate) throw new Error('No completed scheduled security run observed');
    const prefix = 'repos/campfirium/foliole';
    const run = verifiedSecurityRun(api(`${prefix}/actions/runs/${candidate.databaseId}`), candidate);
    const previous = readOwnerRecords(path.join(owner, 'observations')).find(record =>
      record.source?.kind === 'ci' && String(record.source.runId) === String(run.id)
      && record.source.attempt === run.run_attempt);
    if (previous) {
      if (now - Date.parse(previous.checkedAt) > 26 * 3_600_000) throw new Error('Latest scheduled security evidence is older than 26 hours');
      sourceHealth(owner, 'clean', undefined, now);
      return { duplicate: true, observation: previous.id, runId: run.id };
    }
    const artifacts = [];
    for (let page = 1; ; page++) {
      const result = api(`${prefix}/actions/runs/${run.id}/artifacts?per_page=100&page=${page}`);
      if (!Array.isArray(result.artifacts)) throw new Error('Malformed security artifact listing');
      artifacts.push(...result.artifacts);
      if (result.artifacts.length < 100) break;
      if (page >= 20) throw new Error('Security artifact pagination exceeds supported bound');
    }
    const artifact = verifiedSecurityArtifact(run, artifacts);
    const bytes = api(`${prefix}/actions/artifacts/${artifact.id}/zip`, true);
    const rawReport = readSecurityArchive(bytes, artifact,
      path.join(workspace, '.tmp/artifacts/security-maintenance/github-import'), options.extract);
    const lock = api(`${prefix}/contents/package-lock.json?ref=${run.head_sha}`);
    if (lock.encoding !== 'base64' || typeof lock.content !== 'string') throw new Error('Candidate lock bytes unavailable');
    const rawLock = Buffer.from(lock.content, 'base64').toString('utf8');
    const receipt = importSecurityObservation(owner, { rawReport, rawLock, now,
      envelope: { kind: 'ci', repository: 'campfirium/foliole', workflow: 't7-hosted-quality.yml',
        branch: 'dev', headSha: run.head_sha, runId: run.id, attempt: run.run_attempt,
        artifactId: artifact.id, artifactDigest: artifact.digest } });
    sourceHealth(owner, 'clean', undefined, now);
    return { duplicate: receipt.duplicate, observation: receipt.observation.id, runId: run.id, artifactId: artifact.id };
  } catch (error) {
    sourceHealth(owner, 'error', error.message, now);
    return { status: 'error', reason: error.message };
  }
}

function sourceHealth(owner, status, reason, now) {
  recordOwnerHealth(owner, { role: 'github-security-artifact', status, reason, evidenceAt: new Date(now).toISOString() }, now);
}
