import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PULL_TIMEOUT_MS = 5 * 60_000;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function runGit(executeCommand, config, paths, args, code, cwd = paths.checkout) {
  const hooksPath = path.join(paths.root, 'empty-git-hooks');
  fs.mkdirSync(hooksPath, { recursive: true });
  const result = await executeCommand(config.gitPath, ['-c', `core.hooksPath=${hooksPath}`, ...args], {
    cwd,
    env: process.env,
    timeoutCode: `${code}_timeout`,
    timeoutMs: PULL_TIMEOUT_MS
  });
  if (result.code !== 0) throw codedError(code, result.lines.at(-1) || `git exited ${result.code}`);
  return result.output.trim();
}

export async function updateWindowsAndroidLabRepository(config, paths, expectedCommit, executeCommand) {
  if (!fs.existsSync(path.join(paths.checkout, '.git'))) {
    if (fs.existsSync(paths.checkout)) {
      throw codedError('lab_repository_invalid', 'Windows development path exists but is not a Git repository');
    }
    fs.mkdirSync(path.dirname(paths.checkout), { recursive: true });
    await runGit(executeCommand, config, paths, [
      'clone', '--origin', 'lan', '--branch', 'lab/dev', '--single-branch', paths.repository, paths.checkout
    ], 'lab_git_clone_failed', path.dirname(paths.checkout));
  }
  await runGit(executeCommand, config, paths, ['pull', '--ff-only', 'lan', 'lab/dev'], 'lab_git_pull_failed');
  const head = await runGit(executeCommand, config, paths, ['rev-parse', 'HEAD'], 'lab_git_head_failed');
  if (head !== expectedCommit) {
    throw codedError('lab_revision_mismatch', `Windows repository is at ${head || 'unknown'}, expected ${expectedCommit}`);
  }
  return { commitSha: head };
}
