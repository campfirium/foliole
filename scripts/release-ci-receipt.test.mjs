// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readReleaseCiReceipt } from './release-ci-receipt.mjs';

const source = 'a'.repeat(40);
const identity = { sourceSha: source, intent: { version: '0.8.0' } };
const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture({ artifactPatch, runPatch, receiptRun = '42', corrupt = false } = {}) {
  await mkdir('.tmp/artifacts', { recursive: true });
  const cwd = await mkdtemp(path.resolve('.tmp/artifacts/ci-receipt-test-')); roots.push(cwd);
  const name = 'Foliole-iOS-0.8.0-TestFlight.json';
  const receipt = { runId: receiptRun, buildId: 'original-build' };
  await writeFile(path.join(cwd, name), JSON.stringify(receipt));
  execFileSync('zip', ['receipt.zip', name], { cwd });
  const bytes = await readFile(path.join(cwd, 'receipt.zip'));
  const artifact = { id: 7, name: `release-ios-${source}-2`, expired: false,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    workflow_run: { id: 42, head_sha: source, head_branch: 'release' }, ...artifactPatch };
  const build = { id: 42, head_sha: source, head_branch: 'release', path: '.github/workflows/t7-release.yml',
    repository: { full_name: 'campfirium/foliole' }, status: 'completed', conclusion: 'success', ...runPatch };
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    if (command === 'unzip') return execFileSync(command, args, options);
    const endpoint = args[1];
    if (endpoint.endsWith('/zip')) return corrupt ? bytes.subarray(1) : bytes;
    return JSON.stringify(endpoint.includes('/artifacts/') ? artifact : build);
  };
  return { cwd, run, calls, receipt };
}

it('reads the exact same-run receipt ZIP after Release attachments are absent', async () => {
  const f = await fixture();
  await expect(readReleaseCiReceipt({ ...f, identity, platform: 'ios', artifactId: '7' })).resolves.toEqual(f.receipt);
  expect(f.calls.every(call => !call.includes('release'))).toBe(true);
});

it.each([
  { artifactPatch: { expired: true } },
  { artifactPatch: { name: `release-ios-${'b'.repeat(40)}-2` } },
  { artifactPatch: { workflow_run: { id: 42, head_sha: 'b'.repeat(40), head_branch: 'release' } } },
  { runPatch: { conclusion: 'failure' } },
  { runPatch: { path: '.github/workflows/other.yml' } },
  { runPatch: { repository: { full_name: 'another/foliole' } } },
  { artifactPatch: { digest: null } },
  { corrupt: true },
  { receiptRun: '43' }
])('rejects untrusted or damaged CI receipt evidence: %j', async options => {
  const f = await fixture(options);
  await expect(readReleaseCiReceipt({ ...f, identity, platform: 'ios', artifactId: '7' })).rejects.toThrow(/receipt/iu);
});

it('requires an explicit artifact without guessing another source', async () => {
  const f = await fixture();
  await expect(readReleaseCiReceipt({ ...f, identity, platform: 'ios' })).rejects.toThrow(/artifact ID/u);
  expect(f.calls).toEqual([]);
});
