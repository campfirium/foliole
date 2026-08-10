#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runMacosA5SyncGroupApproval } from './macos-a5-sync-group-approval.mjs';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let stderr = ''; let stdout = '';
    child.stdout.on('data', (chunk) => { output += chunk; stdout += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output, stderr, stdout }));
  });
}

export async function runFixedA5WindowsJoin({
  executeProcess = execute, repoRoot = process.cwd(), runApproval = runMacosA5SyncGroupApproval,
  writeWindowsLog = (logPath, output) => {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, output, 'utf8');
  }
} = {}) {
  let windowsWork;
  const windowsLog = path.join(repoRoot, '.tmp/artifacts/a5-sync-group-approval/windows-control.log');
  const approval = await runApproval({
    execute: executeProcess,
    onReady: async () => {
      windowsWork = executeProcess(process.execPath, [
        path.join(repoRoot, 'scripts/windows/windows-dev-control.mjs'), 'sync-group-recover'
      ], { cwd: repoRoot });
      windowsWork.then((result) => writeWindowsLog(windowsLog, result.output));
    },
    repoRoot
  });
  const windows = await windowsWork;
  if (!windows || windows.code !== 0) {
    throw Object.assign(new Error('Windows Sync Group recovery failed'), { result: windows });
  }
  return { output: `${approval.output}${windows.output}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFixedA5WindowsJoin().then((result) => process.stdout.write(result.output)).catch((error) => {
    if (error?.result?.output) process.stderr.write(error.result.output);
    console.error(`[macos-a5-windows-join] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
