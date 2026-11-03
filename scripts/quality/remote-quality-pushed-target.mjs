import { spawnSync } from 'node:child_process';

const SHA = /^[0-9a-f]{40}$/u;
const PUSHED_REF = 'refs/remotes/origin/dev';

// Windows consumes only pushed dev, so validate the exact target before mirroring.
export function assertPushedPreflightTarget(repoRoot, target, run = spawnSync) {
  if (!SHA.test(target ?? '')) throw new Error('remote preflight target must be a full SHA');
  if (run('git', ['cat-file', '-e', `${target}^{commit}`], { cwd: repoRoot }).status !== 0) {
    throw new Error(`remote preflight target ${target} is not a local commit; fetch origin dev first`);
  }
  if (run('git', ['merge-base', '--is-ancestor', target, PUSHED_REF], { cwd: repoRoot }).status !== 0) {
    throw new Error(`remote preflight target ${target} is not on pushed origin/dev; push dev first`);
  }
  return target;
}
