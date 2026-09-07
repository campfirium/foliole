// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  copyWindowsCandidateReceipt, extractCandidateSourceRef, windowsCandidatePushArgs
} from './windows-dev-candidate-control.mjs';
import { parseWindowsDevControlArgs, windowsDevPushSpec } from './windows-dev-control.mjs';

const sourceRef = 'refs/heads/codex/t121-8-sync-from-zero-thread';
const candidate = { revision: 'a'.repeat(40), treeDigest: 'b'.repeat(40) };

it('maps an explicit candidate source ref only to the Windows dev mirror', () => {
  expect(extractCandidateSourceRef(['multi-device-sync-candidate', '--source-ref', sourceRef]))
    .toEqual({ args: ['multi-device-sync-candidate'], explicit: true, sourceRef });
  expect(windowsCandidatePushArgs('host', sourceRef)).toEqual([
    'push', '--no-verify', '--porcelain', 'host:foliole-dev.git',
    `+${sourceRef}:refs/heads/dev`
  ]);
  expect(() => extractCandidateSourceRef(['multi-device-sync-candidate', '--source-ref', 'dev']))
    .toThrow('explicit refs/heads ref');
  expect(parseWindowsDevControlArgs([
    'multi-device-sync-candidate', '--source-ref', sourceRef
  ], {})).toMatchObject({ action: 'multi-device-sync-candidate', sourceRef });
  expect(windowsDevPushSpec('host', {}, '/Users/dev', sourceRef).args.at(-1))
    .toBe(`+${sourceRef}:refs/heads/dev`);
  expect(() => parseWindowsDevControlArgs(['verify', '--source-ref', sourceRef], {}))
    .toThrow('only accepted for candidate preparation');
});

function output(identity) {
  return `[windows-dev-action] multi-device-sync-candidate identity=${identity} manifest=D:/C/foliole/.tmp/artifacts/windows-dev-action/${identity}/multi-device-sync-candidate.json\n`;
}

it('copies a parseable Windows receipt bound to the local commit and tree', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-candidate-'));
  const result = await copyWindowsCandidateReceipt({ localCandidate: candidate,
    output: output('20260813-candidate'), repoRoot, sourceRef,
    copyFile: async (_remote, local) => fs.writeFileSync(local, JSON.stringify({
      candidate: { branch: 'dev', clean: true, committed: true,
        revision: 'a'.repeat(40), treeDigest: 'b'.repeat(40) }, resultStatus: 'success'
    })) });
  expect(result.receipt).toMatchObject({ remoteBranch: 'dev', revision: 'a'.repeat(40),
    sourceRef, targetRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) });
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('rejects a Windows receipt from a different candidate before mutation', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-candidate-mismatch-'));
  await expect(copyWindowsCandidateReceipt({ localCandidate: candidate,
    output: output('20260813-mismatch'), repoRoot, sourceRef,
    copyFile: async (_remote, local) => fs.writeFileSync(local, JSON.stringify({
      candidate: { branch: 'dev', clean: true, committed: true,
        revision: 'c'.repeat(40), treeDigest: 'b'.repeat(40) }, resultStatus: 'success'
    })) })).rejects.toThrow('does not match the local frozen candidate');
  fs.rmSync(repoRoot, { force: true, recursive: true });
});
