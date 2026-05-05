import { spawn } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'}\n${stderr}`));
    });
  });
}

export async function readGitStatus(cwd) {
  const result = await runCommand('git', ['status', '--porcelain'], { cwd });
  return result.stdout.trim();
}

export async function ensureCleanWorkingTree(cwd) {
  const status = await readGitStatus(cwd);
  if (status) {
    throw new Error('working tree is not clean; commit or stash changes before running agent loop');
  }
}

export function buildCommitMessage(task) {
  const tokens = task
    .toLowerCase()
    .replace(/[`"]/g, '')
    .match(/[a-z0-9]+/g);
  const ascii = tokens ? tokens.join('-').slice(0, 32) : '';

  if (!ascii || (tokens?.length ?? 0) < 2) {
    return 'auto(task): codex loop checkpoint';
  }
  return `auto(task): ${ascii}`;
}

export async function commitTrackedChanges(cwd, message) {
  await runCommand('git', ['add', '-A', '--', '.', ':(exclude).lab', ':(exclude).lab/**'], { cwd });
  const staged = await runCommand('git', ['diff', '--cached', '--name-only'], { cwd });
  if (!staged.stdout.trim()) {
    return false;
  }
  await runCommand('git', ['commit', '-m', message], { cwd, stdio: 'inherit' });
  return true;
}
