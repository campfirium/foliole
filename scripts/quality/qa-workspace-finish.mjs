import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { finishTransientWorktree } from '../diagnostics/transient-worktree-lifecycle.mjs';
import { qaGit, qaRecordPath, readQaWorkspace, verifyMountedQaVolume } from './qa-workspace-state.mjs';
import { saveQaRecord, verifyQaRun } from './qa-workspace-integration.mjs';

export function removeQaRemote(record) {
  const active = JSON.parse(qaGitHub(record, ['run', 'list', '--branch', record.branch,
    '--workflow', 'remote-quality.yml', '--limit', '50', '--json', 'status']));
  if (active.some(run => run.status !== 'completed')) throw new Error('QA still has an active hosted run');
  const remote = qaGit(record.devRoot, 'ls-remote', '--heads', 'origin', `refs/heads/${record.branch}`);
  if (!remote) return;
  if (remote.split(/\s/u)[0] !== record.cleanupTip) throw new Error('Remote QA tip changed; preserve the lane');
  qaGit(record.devRoot, 'push', 'origin', '--delete', record.branch);
}

function qaGitHub(record, args) {
  const result = spawnSync('gh', args, { cwd: record.devRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Cannot inspect QA activity');
  return result.stdout;
}

export async function finishQaWorkspace({ repoRoot, verifyRun = verifyQaRun,
  removeRemote = removeQaRemote, verifyVolume = verifyMountedQaVolume,
  finishLocal = finishTransientWorktree }) {
  const record = readQaWorkspace(repoRoot);
  if (!['prepared', 'finishing'].includes(record.phase)) throw new Error('No available QA workspace to finish');
  verifyVolume(record.volumeRoot);
  if (record.phase !== 'finishing') {
    await verifyRun(record, true);
    if (record.run.targetSha !== record.head || record.integrated?.qaTip !== record.head
        || record.integrated.devTip !== qaGit(record.devRoot, 'rev-parse', 'HEAD')) {
      throw new Error('Integrate and validate the complete current QA tip before release');
    }
    record.phase = 'finishing';
    record.cleanupTip = record.head;
    saveQaRecord(record);
  }
  if (existsSync(record.worktreePath) && record.head !== record.cleanupTip) {
    throw new Error('QA changed after cleanup began; preserve the lane');
  }
  // Keep the owner record until remote and local cleanup both succeed.
  await removeRemote(record);
  if (existsSync(record.worktreePath)) {
    finishLocal({ repoRoot: record.devRoot, worktreePath: record.worktreePath, releaseRetention: true });
  } else {
    const branch = qaGit(record.devRoot, 'branch', '--list', record.branch);
    if (branch) {
      if (qaGit(record.devRoot, 'rev-parse', record.branch) !== record.cleanupTip) throw new Error('Local QA tip changed during cleanup');
      qaGit(record.devRoot, 'branch', '-d', record.branch);
    }
    qaGit(record.devRoot, 'worktree', 'prune');
  }
  rmSync(qaRecordPath(record.devRoot));
  return { phase: 'idle' };
}
