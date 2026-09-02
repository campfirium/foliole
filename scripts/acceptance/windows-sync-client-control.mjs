#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const HOST = 'zephu@192.168.0.11';
const KEY = path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab');
const ROOT = 'D:\\C\\foliole-sync';
const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const NPM = 'C:\\Program Files\\nodejs\\npm.cmd';
const ELECTRON_INSTALL = path.win32.join(ROOT, 'node_modules', 'electron', 'install.js');

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function parseWindowsSyncClientArgs(argv) {
  const action = argv[0];
  if (!['align', 'facts', 'start', 'stop'].includes(action)) {
    throw new Error('action must be align, facts, start, or stop');
  }
  const { values } = parseArgs({ args: argv.slice(1), allowPositionals: false, strict: true,
    options: { instance: { type: 'string', default: 'a' }, port: { type: 'string', default: '9222' },
      revision: { type: 'string' } } });
  if (action === 'facts') return { action };
  const port = Number.parseInt(values.port, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('port is invalid');
  if (action === 'stop') return { action, port };
  const revision = values.revision?.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision ?? '')) throw new Error('revision must be a full commit hash');
  if (action === 'align') return { action, revision };
  const instance = values.instance?.toLowerCase();
  if (!['a', 'b'].includes(instance)) throw new Error('instance must be a or b');
  return { action, instance, port, revision };
}

function preflight(revision) {
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location -LiteralPath ${quote(ROOT)}
$root = (git rev-parse --show-toplevel).Trim().Replace('\\', '/')
$head = (git rev-parse HEAD).Trim()
$branch = (git branch --show-current).Trim()
$dirty = @(git status --short)
if ($LASTEXITCODE -ne 0) { throw 'git facts failed' }
if ($root -ne 'D:/C/foliole-sync') { throw "wrong root: $root" }
if ($branch -ne 'sync') { throw "wrong branch: $branch" }
${revision ? `if ($head -ne ${quote(revision)}) { throw "wrong revision: $head" }` : ''}
if ($dirty.Count -ne 0) { throw 'Windows sync checkout is dirty' }
`;
}

function factsScript() {
  return `${preflight()}
[ordered]@{ root = $root; head = $head; branch = $branch; clean = $true } |
  ConvertTo-Json -Compress
`;
}

function alignScript(config) {
  return `${preflight()}
git fetch origin sync
if ($LASTEXITCODE -ne 0) { throw 'Windows sync fetch failed' }
$target = (git rev-parse FETCH_HEAD).Trim()
if ($target -ne ${quote(config.revision)}) { throw "fetched wrong revision: $target" }
git reset --hard $target
if ($LASTEXITCODE -ne 0) { throw 'Windows sync exact alignment failed' }
$head = (git rev-parse HEAD).Trim()
$dirty = @(git status --short)
if ($head -ne ${quote(config.revision)} -or $dirty.Count -ne 0) {
  throw 'Windows sync checkout did not settle on the requested clean revision'
}
& ${quote(NPM)} ci
if ($LASTEXITCODE -ne 0) { throw 'Windows sync dependencies failed to materialize' }
& ${quote(NODE)} ${quote(ELECTRON_INSTALL)}
if ($LASTEXITCODE -ne 0) { throw 'Windows sync Electron runtime failed to materialize' }
& ${quote(NPM)} run electron:rebuild:native
if ($LASTEXITCODE -ne 0) { throw 'Windows sync Electron native ABI rebuild failed' }
Write-Output ("aligned=" + $head)
`;
}

function startScript(config) {
  const artifactRoot = `${ROOT}\\.tmp\\artifacts\\client-pair\\candidate-${config.revision.slice(0, 10)}`
    + `\\instance-${config.instance}\\windows`;
  return `${preflight(config.revision)}
& ${quote(NPM)} run build
if ($LASTEXITCODE -ne 0) { throw 'Windows renderer build failed' }
& ${quote(NPM)} run electron:compile
if ($LASTEXITCODE -ne 0) { throw 'Windows Electron compile failed' }
& ${quote(NODE)} scripts/acceptance/launch-isolated-desktop.mjs ` +
    `--artifact-root ${quote(artifactRoot)} ` +
    `--state-root ${quote(`${artifactRoot}\\state`)} ` +
    `--result ${quote(`${artifactRoot}\\launch.json`)} ` +
    `--revision ${quote(config.revision)} --cdp-port ${config.port}
exit $LASTEXITCODE
`;
}

function stopScript(config) {
  const expected = `${ROOT}\\node_modules\\electron\\dist\\electron.exe`.toLowerCase();
  return `$ErrorActionPreference = 'Stop'
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort ${config.port} -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) { Write-Output 'stopped=already'; exit 0 }
$processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($processId in $processIds) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
  if ($null -eq $process -or $process.ExecutablePath.ToLowerInvariant() -ne ${quote(expected)}) {
    throw "port ${config.port} is not owned by the isolated Foliole Electron client"
  }
  Stop-Process -Id $processId -Force
}
Write-Output ("stopped=" + ($processIds -join ','))
`;
}

export function buildWindowsSyncClientPowerShell(config) {
  if (config.action === 'facts') return factsScript();
  if (config.action === 'align') return alignScript(config);
  if (config.action === 'stop') return stopScript(config);
  return startScript(config);
}

function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const args = ['-T', '-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', HOST,
    'powershell.exe', '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text',
    '-EncodedCommand', encoded];
  const child = spawn('ssh', args, { stdio: 'inherit' });
  child.once('error', (error) => {
    process.stderr.write(`[windows-sync-client] ${error.message}\n`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const config = parseWindowsSyncClientArgs(process.argv.slice(2));
    runPowerShell(buildWindowsSyncClientPowerShell(config));
  } catch (error) {
    process.stderr.write(`[windows-sync-client] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
