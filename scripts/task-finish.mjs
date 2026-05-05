/* global process */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function extractWindowsPreviewStatus(output) {
  const matches = [...output.matchAll(/\[windows-preview\] status:\s*([A-Z_]+)/g)];
  return matches.at(-1)?.[1] ?? null;
}

export function defaultWindowsPreviewRunner({ cwd = REPO_ROOT, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'windows:preview'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

export async function runTaskFinish({
  cwd = REPO_ROOT,
  env = process.env,
  runWindowsPreview = defaultWindowsPreviewRunner
} = {}) {
  const previewResult = await runWindowsPreview({ cwd, env });
  return {
    ...previewResult,
    executed: true,
    exitCode: previewResult.code,
    previewStatus: extractWindowsPreviewStatus(previewResult.stdout),
    status: previewResult.code === 0 ? 'EXECUTED' : 'FAILED'
  };
}

async function main() {
  const result = await runTaskFinish();
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.stdout.write(
    `[task-finish] windows preview ${result.status.toLowerCase()}: ${
      result.previewStatus ?? 'status-unavailable'
    }\n`
  );
  process.exit(result.exitCode);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
