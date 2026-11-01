// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { androidSubmissionObservation, submitAndroidDependencyGraphs } from './android-dependency-submission.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const base = path.resolve('.tmp/artifacts/T674-2/submission-tests'); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'run-')); roots.push(root);
  const directory = path.join(root, 'graphs'); mkdirSync(directory);
  const expected = 'a'.repeat(40), receiptFile = path.join(root, 'receipt.json');
  writeFileSync(path.join(directory, 'graph.json'), JSON.stringify({ version: 0, sha: expected, ref: 'refs/heads/dev',
    detector: { name: 'GitHub Dependency Graph Gradle Plugin' }, manifests: {},
    url: 'https://untrusted.example', headers: { malicious: 'header' } }));
  return { root, directory, expected, receiptFile, token: 'test-secret' };
}
it.each(['SUCCESS', 'ACCEPTED', 'ERROR'])('persists the actual API result %s and qualifies only effective updates', async result => {
  const input = fixture(); let request;
  const receipt = await submitAndroidDependencyGraphs({ ...input, fetchImpl: async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 201, json: async () => ({ id: 123, result, created_at: new Date().toISOString(), message: result === 'ACCEPTED' ? 'superseded' : 'updated' }) };
  } });
  expect(request.url).toBe('https://api.github.com/repos/campfirium/foliole/dependency-graph/snapshots');
  expect(request.body.url).toBeUndefined(); expect(request.body.headers).toBeUndefined();
  expect(receipt.status).toBe(result === 'SUCCESS' ? 'clean' : 'error');
  const persisted = readFileSync(input.receiptFile, 'utf8'); expect(persisted).not.toContain(input.token);
  const row = androidSubmissionObservation({ FOLIOLE_ANDROID_SUBMISSION_RECEIPT: input.receiptFile },
    { revision: input.expected }, { gradleVersion: '8.14.6' });
  expect(row.status).toBe(receipt.status);
  expect(androidSubmissionObservation({ FOLIOLE_ANDROID_SUBMISSION_RECEIPT: input.receiptFile },
    { revision: 'b'.repeat(40) }, { gradleVersion: '8.14.6' }).status).toBe('error');
});
it('records absent graphs, source faults, invalid candidate and stale receipts without reporting clean', async () => {
  const input = fixture();
  expect((await submitAndroidDependencyGraphs({ ...input, expected: 'b'.repeat(40), fetchImpl: () => { throw new Error('Must not submit mismatched candidate'); } })).status).toBe('error');
  expect((await submitAndroidDependencyGraphs({ ...input, fetchImpl: () => { throw new Error('Source unavailable'); } })).status).toBe('error');
  writeFileSync(input.receiptFile, JSON.stringify({ schemaVersion: 1, expected: input.expected, status: 'clean',
    checkedAt: '2025-01-01T00:00:00Z', submissions: [{ result: { result: 'SUCCESS' } }] }));
  expect(androidSubmissionObservation({ FOLIOLE_ANDROID_SUBMISSION_RECEIPT: input.receiptFile },
    { revision: input.expected }, { gradleVersion: '8.14.6' }).status).toBe('error');
  expect(androidSubmissionObservation({ GITHUB_ACTIONS: 'true' }, { revision: input.expected }, { gradleVersion: '8.14.6' }).status).toBe('error');
  rmSync(path.join(input.directory, 'graph.json'));
  expect((await submitAndroidDependencyGraphs(input)).status).toBe('error');
});
