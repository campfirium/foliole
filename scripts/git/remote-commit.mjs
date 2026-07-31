import { spawnSync } from 'node:child_process';

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

export function isCommitOnRemote(revision) {
  return runGit([
    'for-each-ref',
    '--contains',
    revision,
    '--format=%(refname)',
    'refs/remotes'
  ]).split('\n').some(Boolean);
}

export function findFirstParentRemoteBase(revision) {
  const commits = runGit([
    'rev-list',
    '--first-parent',
    '--reverse',
    revision,
    '--not',
    '--remotes'
  ]).split('\n').filter(Boolean);
  if (commits.length === 0) return revision;
  const parents = runGit(['show', '-s', '--format=%P', commits[0]]).split(/\s+/u).filter(Boolean);
  return parents[0] ?? null;
}
