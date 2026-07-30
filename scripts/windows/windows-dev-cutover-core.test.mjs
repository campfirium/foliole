// @vitest-environment node

import { expect, it } from 'vitest';

import {
  parseCutoverArgs, preReceiveHook, replaceForcedKeyLine, signingIdentity,
  validateCutoverSnapshot
} from './windows-dev-cutover-core.mjs';

const paths = {
  oldBareRepository: 'C:\\old\\repository.git', receiver: 'C:\\new\\receive.mjs',
  signingKeystore: 'C:\\signing\\debug.keystore', systemNode: 'C:\\Program Files\\nodejs\\node.exe'
};

it('defaults to dry-run and requires an explicit apply or rollback mode', () => {
  expect(parseCutoverArgs([])).toEqual({ mode: 'dry-run' });
  expect(parseCutoverArgs(['--apply'])).toEqual({ mode: 'apply' });
  expect(() => parseCutoverArgs(['--apply', '--force'])).toThrow('cutover accepts');
});

it('replaces exactly one legacy forced command without changing its key identity', () => {
  const key = 'A'.repeat(68);
  const lines = [
    'ssh-ed25519 BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB shell',
    `command="C:\\old\\node.exe C:\\old\\windows-android-lab-receive.mjs",no-pty ssh-ed25519 ${key} git`
  ];
  const result = replaceForcedKeyLine(lines, paths);
  expect(result.lines[0]).toBe(lines[0]);
  expect(result.nextLine).toContain("& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\new\\receive.mjs'");
  expect(result.nextLine).toContain(`ssh-ed25519 ${key} git`);
});

it('locks the bare receiver to refs/heads/dev without delete', () => {
  expect(preReceiveHook()).toContain('refs/heads/dev');
  expect(preReceiveHook()).toContain('cannot be deleted');
  expect(preReceiveHook()).not.toContain('lab/dev');
});

it('requires the legacy signing hash to match before writing the narrow manifest', () => {
  const hash = 'a'.repeat(64);
  expect(signingIdentity({ androidDebugKeystoreSha256: hash }, paths, hash)).toEqual({
    keystorePath: paths.signingKeystore, schemaVersion: 1, sha256: hash
  });
  expect(() => signingIdentity({ androidDebugKeystoreSha256: hash }, paths, 'b'.repeat(64)))
    .toThrow('hash changed');
});

it('produces an ordered inverse only for the exact legacy repo/ref state', () => {
  const snapshot = {
    branch: 'lab/dev', gitExists: true, head: 'a'.repeat(40), newBareExists: false,
    nodeExists: true, npmExists: true, oldBareExists: true,
    oldBareRepository: paths.oldBareRepository, oldRefSha: 'a'.repeat(40),
    receiverSourceExists: true, remoteUrl: paths.oldBareRepository, repoRoot: 'C:\\repo',
    signingKeystoreExists: true
  };
  expect(validateCutoverSnapshot(snapshot).rollbackOrder[0]).toContain('forced-command key');
  expect(() => validateCutoverSnapshot({ ...snapshot, newBareExists: true }))
    .toThrow('already exists');
  expect(() => validateCutoverSnapshot({ ...snapshot, branch: 'dev' }))
    .toThrow('lab/dev');
});
