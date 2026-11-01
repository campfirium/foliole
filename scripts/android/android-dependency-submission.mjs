/* global console */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://api.github.com/repos/campfirium/foliole/dependency-graph/snapshots';
const FIELDS = ['version', 'job', 'sha', 'ref', 'detector', 'metadata', 'manifests', 'scanned'];
export async function submitAndroidDependencyGraphs({ directory, receiptFile, expected, token, fetchImpl = globalThis.fetch }) {
  const receipt = { schemaVersion: 1, checkedAt: new Date().toISOString(), expected, source: ENDPOINT, status: 'error', submissions: [] };
  try {
    if (!/^[a-f0-9]{40}$/u.test(expected ?? '') || !token) throw new Error('Submission requires the scheduled SHA and GitHub token');
    const files = readdirSync(directory, { recursive: true }).filter(name => name.endsWith('.json'));
    if (!files.length) throw new Error('No generated dependency snapshots');
    for (const file of files) {
      const snapshot = JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
      if (snapshot.sha !== expected || snapshot.ref !== 'refs/heads/dev' || !snapshot.manifests
        || snapshot.detector?.name !== 'GitHub Dependency Graph Gradle Plugin') throw new Error('Snapshot candidate or detector mismatch');
      const response = await fetchImpl(ENDPOINT, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
        body: JSON.stringify(Object.fromEntries(FIELDS.filter(key => key in snapshot).map(key => [key, snapshot[key]]))),
        signal: globalThis.AbortSignal.timeout(20_000) });
      const result = await response.json();
      receipt.submissions.push({ file, httpStatus: response.status, result });
      if (!response.ok || result.result !== 'SUCCESS' || !Number.isInteger(result.id)
        || !Number.isFinite(Date.parse(result.created_at))) throw new Error('Dependency submission did not update repository results; inspect receipt');
    }
    receipt.status = 'clean';
  } catch (error) { receipt.reason = error.message; }
  mkdirSync(path.dirname(receiptFile), { recursive: true });
  writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function androidSubmissionObservation(env, candidate, inventory) {
  const row = { asset: 'android-maven', route: 'dependency-submission', checkedAt: new Date().toISOString(),
    source: ENDPOINT, status: 'unsupported', findings: [], reason: 'effective-submission-receipt-unavailable',
    evidence: { versions: { gradle: inventory.gradleVersion } } };
  try {
    if (!env.FOLIOLE_ANDROID_SUBMISSION_RECEIPT) {
      if (env.GITHUB_ACTIONS === 'true') throw new Error('Scheduled submission receipt is missing');
      return row;
    }
    const receipt = JSON.parse(readFileSync(env.FOLIOLE_ANDROID_SUBMISSION_RECEIPT, 'utf8'));
    row.evidence.receipt = receipt;
    if (receipt.schemaVersion !== 1 || receipt.expected !== candidate?.revision || receipt.source !== ENDPOINT || receipt.status !== 'clean'
      || !receipt.submissions?.length || receipt.submissions.some(submission => submission.httpStatus !== 201 || submission.result?.result !== 'SUCCESS'
        || !Number.isInteger(submission.result.id) || !Number.isFinite(Date.parse(submission.result.created_at)))
      || Date.now() - Date.parse(receipt.checkedAt) < -300_000
      || Date.now() - Date.parse(receipt.checkedAt) > 26 * 3_600_000
      || !Number.isFinite(Date.parse(receipt.checkedAt))) throw new Error('No current effective dependency submission for this candidate');
    row.status = 'clean'; row.reason = 'github-confirmed-repository-results-updated';
  } catch (error) { row.status = 'error'; row.reason = error.message; }
  return row;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = await submitAndroidDependencyGraphs({ directory: path.resolve('.tmp/artifacts/security-maintenance/hosted/dependency-graph'),
    receiptFile: path.resolve('.tmp/artifacts/security-maintenance/hosted/dependency-submission.json'),
    expected: process.env.FOLIOLE_SECURITY_TARGET_SHA, token: process.env.GITHUB_TOKEN });
  console.log(JSON.stringify({ status: receipt.status, submissions: receipt.submissions.length, reason: receipt.reason }));
  if (receipt.status !== 'clean') process.exitCode = 1;
}
