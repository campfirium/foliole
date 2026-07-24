// @vitest-environment node
/* global Response */

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { downloadArtifact, resolveArtifact, validateArchiveEntries } from './windows-device-artifact.mjs';

const request = { commitSha: 'a'.repeat(40), runId: '12' };

it('selects the single unexpired artifact bound to the requested commit', async () => {
  const artifact = { archive_download_url: 'https://example.test/zip', digest: `sha256:${'b'.repeat(64)}`, expired: false, name: 'foliole-windows-release', size_in_bytes: 10, workflow_run: { head_sha: request.commitSha } };
  const fetchImpl = async (url) => new Response(JSON.stringify(url.includes('/artifacts?')
    ? { artifacts: [artifact] }
    : { conclusion: 'success', head_sha: request.commitSha, run_attempt: 2, status: 'completed' }), { status: 200 });
  await expect(resolveArtifact(request, { fetchImpl, token: 'token' })).resolves.toEqual({ ...artifact, runAttempt: '2' });
  await expect(resolveArtifact({ ...request, commitSha: 'c'.repeat(40) }, { fetchImpl, token: 'token' })).rejects.toMatchObject({ code: 'artifact_identity_mismatch' });
});

it('verifies the downloaded archive digest and maps authentication failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-device-artifact-'));
  const bytes = Buffer.from('artifact');
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const outputPath = path.join(root, 'artifact.zip');
  fs.writeFileSync(outputPath, 'previous artifact');
  await downloadArtifact({ archive_download_url: 'https://example.test/zip', digest }, outputPath, {
    fetchImpl: async () => new Response(bytes, { status: 200 }), token: 'token'
  });
  expect(fs.readFileSync(outputPath)).toEqual(bytes);
  await expect(downloadArtifact({ archive_download_url: 'x', digest }, path.join(root, 'bad.zip'), {
    fetchImpl: async () => new Response('bad credentials', { status: 401 }), token: 'bad'
  })).rejects.toMatchObject({ code: 'github_auth_failed' });
});

it('rejects archive paths that escape the candidate directory', () => {
  expect(validateArchiveEntries('validation-kit/manifest.json\nFoliole.exe\n')).toHaveLength(2);
  expect(() => validateArchiveEntries('../outside.txt\n')).toThrow('unsafe');
  expect(() => validateArchiveEntries('C:\\outside.txt\n')).toThrow('unsafe');
});
