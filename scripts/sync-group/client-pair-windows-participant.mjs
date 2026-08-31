import { spawn } from 'node:child_process';

/* global Buffer */

const HOST = 'zephu@192.168.0.11';
const KEY = '/Users/roamer/.ssh/agent/foliole-windows-android-lab';
const REPO = 'D:\\C\\foliole-sync';

function encoded(source) {
  return Buffer.from(source, 'utf16le').toString('base64');
}
function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, reject, resolve };
}

function sshPowerShell(source, capture = true) {
  return spawn('ssh', ['-T', '-i', KEY, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
    '-o', 'ConnectTimeout=15', HOST, 'powershell.exe', '-NoProfile', '-NonInteractive',
    '-EncodedCommand', encoded(source)], {
    stdio: ['ignore', capture ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore']
  });
}

function markerEvents(child) {
  const pending = new Map();
  const seen = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const match = /^\[client-pair\] ([a-z-]+)=([A-Za-z0-9+/=]+)$/u.exec(line.trim());
      if (!match) continue;
      const value = JSON.parse(Buffer.from(match[2], 'base64').toString('utf8'));
      seen.set(match[1], value);
      pending.get(match[1])?.resolve(value);
    }
  });
  child.on('close', (code) => {
    for (const { reject } of pending.values()) {
      reject(new Error(`Windows client-pair participant exited before its marker: ${code}`));
    }
  });
  return (name) => {
    if (seen.has(name)) return Promise.resolve(seen.get(name));
    if (!pending.has(name)) pending.set(name, deferred());
    return pending.get(name).promise;
  };
}

export function startWindowsClientPairParticipant({ groupIdentity, role, runId, scenario,
  revision, skipBuild = false }) {
  const signalRoot = `${REPO}\\.tmp\\artifacts\\client-pair-sync\\${runId}\\${scenario}`;
  const source = [
    `$repo='${REPO}'`, `Set-Location -LiteralPath $repo`,
    '$branch=git -c safe.directory=$repo branch --show-current',
    '$dirty=@(git -c safe.directory=$repo status --short)',
    '$revision=git -c safe.directory=$repo rev-parse HEAD',
    `if ($branch -ne 'sync' -or $dirty.Count -ne 0 -or $revision -ne '${revision}') { exit 64 }`,
    `$signalRoot='${signalRoot}'`,
    'Remove-Item -LiteralPath $signalRoot -Recurse -Force -ErrorAction SilentlyContinue',
    'New-Item -ItemType Directory -Force -Path $signalRoot | Out-Null',
    `$env:FOLIOLE_PAIR_ROLE='${role}'`, `$env:FOLIOLE_PAIR_SIGNAL_ROOT=$signalRoot`,
    `$env:FOLIOLE_PAIR_GROUP_ID='${groupIdentity?.groupId ?? ''}'`,
    `$env:FOLIOLE_PAIR_GROUP_TAG='${groupIdentity?.groupTag ?? ''}'`,
    `$env:FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD='${skipBuild ? '1' : '0'}'`,
    `$env:FOLIOLE_ELECTRON_APP_ROOT='${REPO}'`, `$env:FOLIOLE_WINDOWS_WORKDIR='${REPO}'`,
    "& 'C:\\Program Files\\nodejs\\node.exe' scripts\\desktop\\playwright-desktop-native-hidden.mjs tests/desktop/client-pair-sync-participant.spec.ts",
    'exit $LASTEXITCODE'
  ].join('; ');
  const child = sshPowerShell(source);
  const event = markerEvents(child);
  let stderr = '';
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const finished = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, stdout }));
  });
  return { event, finished, signalRoot };
}

export async function signalWindowsClientPair(signalRoot, name, value = {}) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`).toString('base64');
  const target = `${signalRoot}\\${name}.json`;
  const source = `[IO.File]::WriteAllBytes('${target}',[Convert]::FromBase64String('${bytes}'))`;
  const child = sshPowerShell(source, false);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`signal failed: ${name}`)));
  });
}
