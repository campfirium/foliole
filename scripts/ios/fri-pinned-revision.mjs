import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REVISION = /^[0-9a-f]{40}$/u;

function git(repoRoot, args, run) {
  const result = run('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

// Proves the current checkout is exactly the requested commit; it never moves the checkout.
export function assertFriPinnedRevision(repoRoot, revision, run = spawnSync) {
  if (!REVISION.test(revision ?? '')) throw new Error('Fri pinned revision must be a full SHA.');
  if (git(repoRoot, ['status', '--porcelain', '--untracked-files=no'], run)) {
    throw new Error('Fri pinned revision requires a clean tracked worktree.');
  }
  if (git(repoRoot, ['rev-parse', 'HEAD'], run) !== revision) {
    throw new Error('Fri pinned revision requires HEAD to equal the requested commit.');
  }
  return { revision, tree: git(repoRoot, ['rev-parse', `${revision}^{tree}`], run) };
}

export function writeFriPinnedRevision(evidenceRoot, pinned) {
  const target = path.join(evidenceRoot, 'pinned-revision.json');
  fs.writeFileSync(target, `${JSON.stringify({ schemaVersion: 1, ...pinned }, null, 2)}\n`, 'utf8');
  return target;
}
