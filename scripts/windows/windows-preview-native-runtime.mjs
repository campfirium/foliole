/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function npmRunCommand(scriptName) {
  if (process.env.npm_execpath) {
    return { args: [process.env.npm_execpath, 'run', scriptName], command: process.execPath };
  }
  return { args: ['run', scriptName], command: process.platform === 'win32' ? 'npm.cmd' : 'npm' };
}

export function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      resolve({ code: 1, error, stderr: error instanceof Error ? error.message : String(error), stdout });
      return;
    }
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      resolve({ code: 1, error, stderr, stdout });
    });
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, error: null, stderr, stdout });
    });
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

export async function resolveChangedFiles(repoRoot) {
  const commands = [
    ['diff', '--name-only', '--diff-filter=ACMR'],
    ['diff', '--name-only', '--diff-filter=ACMR', '--cached'],
    ['ls-files', '--others', '--exclude-standard']
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
