import { createHash } from 'node:crypto';
import path from 'node:path';

const OLD_RECEIVER_MARKER = 'windows-android-lab-receive.mjs';

function contractError(message) {
  return Object.assign(new Error(message), { exitCode: 64, stage: 'preflight' });
}

export function parseCutoverArgs(argv) {
  if (argv.length === 0) return { mode: 'dry-run' };
  if (argv.length === 1 && ['--apply', '--rollback', '--finalize'].includes(argv[0])) {
    return { mode: argv[0].slice(2) };
  }
  throw contractError('cutover accepts no argument, --apply, --rollback, or --finalize');
}

export function oldForcedKeyLine(lines) {
  const matches = lines.filter((line) => line.includes(OLD_RECEIVER_MARKER));
  if (matches.length !== 1) throw contractError('exactly one legacy Git forced-command key is required');
  return matches[0];
}

export function replaceForcedKeyLine(lines, paths) {
  const oldLine = oldForcedKeyLine(lines);
  const keyMatch = /\b(ssh-ed25519\s+[A-Za-z0-9+/]+={0,3}(?:\s+.*)?)$/u.exec(oldLine);
  if (!keyMatch) throw contractError('legacy Git key line is malformed');
  const command = `& '${paths.systemNode}' '${paths.receiver}'`;
  const nextLine = `command="${command}",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc ${keyMatch[1]}`;
  return {
    keySha256: createHash('sha256').update(keyMatch[1].split(/\s+/u)[1], 'base64').digest('base64url'),
    lines: lines.map((line) => line === oldLine ? nextLine : line),
    nextLine,
    oldLine
  };
}

export function preReceiveHook() {
  return `#!/bin/sh
while read old new ref; do
  if [ "$ref" != "refs/heads/dev" ]; then
    echo "only refs/heads/dev is accepted" >&2
    exit 1
  fi
  if [ "$new" = "0000000000000000000000000000000000000000" ]; then
    echo "refs/heads/dev cannot be deleted" >&2
    exit 1
  fi
done
`;
}

export function signingIdentity(config, paths, actualHash, canonicalKeystore = paths.signingKeystore) {
  const expected = String(config.androidDebugKeystoreSha256 || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(expected)) throw contractError('legacy signing identity is missing');
  if (actualHash.toLowerCase() !== expected) throw contractError('legacy signing keystore hash changed');
  return { keystorePath: canonicalKeystore, schemaVersion: 1, sha256: expected };
}

export function validateCutoverSnapshot(snapshot) {
  const requiredFiles = [
    'gitExists', 'nodeExists', 'npmExists', 'oldBareExists', 'receiverSourceExists',
    'signingKeystoreExists'
  ];
  for (const name of requiredFiles) {
    if (!snapshot[name]) throw contractError(`cutover preflight failed: ${name}`);
  }
  if (snapshot.newBareExists) throw contractError('new bare repository already exists');
  if (snapshot.branch !== 'lab/dev') throw contractError('working repository must still be on lab/dev');
  if (!/^[0-9a-f]{40}$/u.test(snapshot.oldRefSha)) throw contractError('legacy source ref is invalid');
  if (snapshot.head !== snapshot.oldRefSha) throw contractError('working HEAD differs from legacy source ref');
  const oldRemote = path.win32.resolve(snapshot.repoRoot, snapshot.remoteUrl).toLowerCase();
  if (oldRemote !== path.win32.resolve(snapshot.oldBareRepository).toLowerCase()) {
    throw contractError('working repository remote is not the legacy bare repository');
  }
  return {
    actions: [
      'move legacy bare repository', 'create refs/heads/dev and fixed pre-receive hook',
      'write signing identity manifest', 'rename working branch and remote',
      'replace the legacy forced-command key'
    ],
    rollbackOrder: [
      'restore legacy forced-command key', 'restore working branch and remote',
      'move bare repository back', 'restore signing manifest'
    ]
  };
}
