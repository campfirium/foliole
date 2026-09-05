/* global clearTimeout, console, process, setTimeout */

import { spawn, spawnSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createNpmCommand(args, env = process.env, platform = process.platform, nodePath = process.execPath) {
  if (env.npm_execpath) {
    return { args: [env.npm_execpath, ...args], command: nodePath };
  }
  if (platform === 'win32') {
    const windowsPath = path.win32;
    return {
      args: [windowsPath.join(windowsPath.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args],
      command: nodePath
    };
  }
  return { args, command: 'npm' };
}

export function npmRunCommand(scriptName) {
  return createNpmCommand(['run', scriptName]);
}

export function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    let settled = false;
    let timeout = null;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({ stderr, stdout, ...result });
    };
    try {
      child = spawn(command, args, {
        cwd: options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      finish({ code: 1, error, stderr: error instanceof Error ? error.message : String(error), stdout });
      return;
    }
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      finish({ code: 1, error, stderr, stdout });
    });
    child.on('exit', (code) => {
      finish({ code: code ?? 1, error: null, stderr, stdout });
    });
    if (options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          child.kill();
        }
        finish({
          code: 1,
          error: new Error(`${command} timed out after ${options.timeoutMs}ms`)
        });
      }, options.timeoutMs);
      timeout.unref?.();
    }
  });
}

export async function runChecked(command, args, label, cwd) {
  console.log(`[windows-preview-native] ${label}`);
  const result = await runCapture(command, args, { cwd });
  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  if (result.code !== 0) {
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    throw new Error(`${label} failed`);
  }
}

export async function resolveCurrentHead(repoRoot) {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return result.stdout.trim();
  } catch {
    return '';
  }
}

export async function resolveChangedFiles(repoRoot, targetPaths = ['.'], options = {}) {
  const pathArgs = ['--', ...targetPaths];
  const diffFilter = options.includeDeletes ? 'ACMRD' : 'ACMR';
  const commands = [
    ['diff', '--name-only', `--diff-filter=${diffFilter}`, ...pathArgs],
    ['diff', '--name-only', `--diff-filter=${diffFilter}`, '--cached', ...pathArgs],
    ['ls-files', '--others', '--exclude-standard', ...pathArgs]
  ];
  const files = new Set();
  for (const args of commands) {
    const result = await execFileAsync('git', args, { cwd: repoRoot });
    for (const file of result.stdout.split(/\r?\n/u).filter(Boolean)) {
      files.add(file.replaceAll('\\', '/'));
    }
  }
  return [...files].sort();
}

export async function resolveCommittedFilesSince(repoRoot, fromHead, toHead) {
  if (!fromHead || !toHead || fromHead === toHead) {
    return [];
  }
  try {
    await execFileAsync('git', ['rev-parse', '--verify', `${fromHead}^{commit}`], { cwd: repoRoot });
    const result = await execFileAsync('git', ['diff', '--name-only', `${fromHead}..${toHead}`], { cwd: repoRoot });
    return result.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((file) => file.replaceAll('\\', '/'))
      .sort();
  } catch {
    return null;
  }
}
