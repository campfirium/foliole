import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { fingerprintSecretFreeCandidate } from './macos-a5-sync-group-rejoin-contract.mjs';

export function captureSyncGroupCandidate(repoRoot, acceptedRevision = null) {
  const revision = execFileSync('git', ['rev-parse', acceptedRevision ?? 'HEAD'], {
    cwd: repoRoot, encoding: 'utf8'
  }).trim();
  if (acceptedRevision) {
    const treeDigest = execFileSync('git', ['rev-parse', `${revision}^{tree}`], {
      cwd: repoRoot, encoding: 'utf8'
    }).trim();
    return { revision, treeDigest, untracked: [] };
  }
  const diff = execFileSync('git', ['diff', '--binary', 'HEAD', '--', '.'], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot, encoding: 'utf8'
  }).split('\0').filter(Boolean).sort();
  const material = [
    diff,
    ...untracked.map((name) => `${name}\0${fs.readFileSync(path.join(repoRoot, name))}`)
  ].join('\0');
  return { revision, treeDigest: fingerprintSecretFreeCandidate(material), untracked };
}

export function assertFrozenSyncGroupCandidate(expected, repoRoot, acceptedRevision = null) {
  const current = captureSyncGroupCandidate(repoRoot, acceptedRevision);
  if (current.revision !== expected.revision || current.treeDigest !== expected.treeDigest
      || JSON.stringify(current.untracked) !== JSON.stringify(expected.untracked)) {
    throw new Error('T132-3 candidate source boundary changed during the real journey.');
  }
}
