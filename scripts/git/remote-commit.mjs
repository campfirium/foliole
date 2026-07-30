import { spawnSync } from 'node:child_process';

export function isCommitOnRemote(revision) {
  const result = spawnSync(
    'git',
    ['for-each-ref', '--contains', revision, '--format=%(refname)', 'refs/remotes'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Unable to inspect remote refs for ${revision}`);
  }
  return result.stdout.split('\n').some(Boolean);
}
