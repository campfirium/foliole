import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { runT1527HostReadiness } from './t152-7-host-readiness.mjs';

const REVISION = 'a'.repeat(40);
const candidate = { branch: 'dev', clean: true, committed: true, mode: 'formal',
  revision: REVISION, sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) };

function options(repoRoot, readiness, probeCalls) {
  return { collectReadiness: async () => readiness,
    createAdapters: () => ({ 'macos-a': async () => ({ facts: ['mac'] }) }),
    createFriAdapter: () => async () => ({ facts: ['fri'] }), createRoot: () => undefined,
    id: 'gate-test', inspectCandidate: () => candidate,
    inspectOrigin: () => ({ ...candidate, sourceRef: 'refs/remotes/origin/dev' }), repoRoot,
    runFriProbe: async () => { probeCalls.push(true); return { facts: ['fri-probe'] }; } };
}

it('short-circuits the physical control-plane probe when any client is blocked', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't152-readiness-'));
  const probeCalls = [];
  const readiness = { allReady: false, receipts: [{ host: 'windows-c', status: 'blocked' }],
    status: 'blocked' };
  const result = await runT1527HostReadiness(options(repoRoot, readiness, probeCalls));
  expect(result.receipt.resultStatus).toBe('blocked');
  expect(probeCalls).toEqual([]);
});

it('runs the physical control-plane probe only after every client is ready', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't152-readiness-'));
  const probeCalls = [];
  const readiness = { allReady: true, receipts: [], status: 'passed' };
  const result = await runT1527HostReadiness(options(repoRoot, readiness, probeCalls));
  expect(result.receipt.resultStatus).toBe('ready');
  expect(probeCalls).toEqual([true]);
});

it('rejects a candidate that is not frozen at origin/dev', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't152-readiness-'));
  const gateOptions = options(repoRoot, { allReady: true }, []);
  gateOptions.inspectOrigin = () => ({ ...candidate, revision: 'c'.repeat(40) });
  await expect(runT1527HostReadiness(gateOptions)).rejects.toThrow('HEAD to equal origin/dev');
});
