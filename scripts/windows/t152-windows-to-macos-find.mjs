#!/usr/bin/env node
/* global console, process, URL */

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = 'zephu@192.168.0.11';
const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';

function sshBase() {
  const key = process.env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(
      Object.assign(new Error(`${command} exited ${code}`), { output })
    ));
  });
}

async function upload(filePath, remoteName) {
  return run('scp', ['-q', ...sshBase(), filePath, `${HOST}:${remoteName}`]);
}

async function download(remotePath, localPath) {
  return run('scp', ['-q', ...sshBase(), `${HOST}:${remotePath.replaceAll('\\', '/')}`, localPath]);
}

function remoteCommand(action, capsuleAttempt, attemptId) {
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', 't152-windows-capsule-action.ps1', '-Action', action,
    '-AttemptId', attemptId, '-CapsuleAttemptId', capsuleAttempt];
}

function startAdvertisement(capsuleAttempt, attemptId) {
  const child = spawn('ssh', ['-T', ...sshBase(), HOST,
    ...remoteCommand('advertise-acceptance', capsuleAttempt, attemptId)], {
    shell: false, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let readyResolve; let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const collect = (chunk, stream) => {
    const text = chunk.toString(); output += text; stream.write(chunk);
    const match = /provider-ready group=(group-[0-9a-f-]{36}) tag=([0-9a-f]{32})/u.exec(output);
    if (match) readyResolve({ groupId: match[1], groupTag: match[2] });
  };
  child.stdout.on('data', (chunk) => collect(chunk, process.stdout));
  child.stderr.on('data', (chunk) => collect(chunk, process.stderr));
  const done = new Promise((resolve, reject) => {
    child.on('error', (error) => { readyReject(error); reject(error); });
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else { const error = Object.assign(new Error(`Windows advertisement exited ${code}`), { output });
        readyReject(error); reject(error); }
    });
  });
  return { done, ready };
}

async function modules(productSource) {
  const url = pathToFileURL(productSource);
  return Promise.all([
    import(new URL('scripts/android/macos-sync-group-desktop-session.mjs', `${url.href}/`)),
    import(new URL('scripts/desktop/t152-desktop-dnssd-library.mjs', `${url.href}/`)),
    import(new URL('scripts/sync-group/multi-device-sync-macos-channel.mjs', `${url.href}/`))
  ]);
}

export async function runWindowsToMacosFind({ attemptId, capsuleAttempt, controllerCommit,
  controllerRoot, productSource, repoRoot = process.cwd() }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, '.tmp', 'artifacts',
    't152-15-product-capsule', capsuleAttempt, 'manifest.json'), 'utf8'));
  if (manifest.identity.productCommit !== PRODUCT_COMMIT
      || manifest.identity.controllerCommit !== controllerCommit) throw new Error('identity mismatch');
  const parent = path.join(repoRoot, '.tmp', 'artifacts', 't152-15-formal-reverse');
  const evidenceRoot = path.join(parent, attemptId);
  fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(evidenceRoot, { recursive: false });
  await upload(path.join(controllerRoot, 'scripts/windows/t152-windows-capsule-action.ps1'),
    't152-windows-capsule-action.ps1');
  await upload(path.join(controllerRoot, 'scripts/windows/t152-windows-capsule-formal-runner.mjs'),
    't152-windows-capsule-formal-runner.mjs');
  const provider = startAdvertisement(capsuleAttempt, attemptId);
  let session;
  let providerReady = false;
  const locatorPath = path.join(evidenceRoot, 'locator.json');
  try {
    const expected = await provider.ready;
    providerReady = true;
    const [macos, libraryOwner, channel] = await modules(productSource);
    const library = libraryOwner.createT152DesktopDnsSdLibrary({ attemptId,
      baseRoot: '/private/tmp/foliole-t152-libraries', evidenceRoot, sourceRoot: productSource });
    session = await macos.openMacosSyncGroupDesktopSession({ env: channel.macosAcceptanceEnv(),
      libraryHome: library.libraryHome, operationId: attemptId, repoRoot: productSource,
      runtimeLogPath: path.join(evidenceRoot, 'macos-runtime.log'),
      runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
    const preflight = await session.loadDnsSdIdentityPreflight(expected.groupId);
    const overview = await session.waitForState({ command: 'load_sync_group_overview', condition: {
      groupId: expected.groupId, groupTag: expected.groupTag, kind: 'candidate-identity'
    }, eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 120_000,
    triggerCommand: 'discover_sync_groups' });
    const matches = overview.join_candidates.filter((item) =>
      item.group_id === expected.groupId && item.group_tag === expected.groupTag);
    if (matches.length !== 1) throw new Error('Mac formal Find candidate was not unique');
    await session.invoke('stop_discover_sync_groups');
    await run('ssh', ['-T', ...sshBase(), HOST,
      ...remoteCommand('release-complete', capsuleAttempt, attemptId)]);
    const output = await provider.done;
    const receipt = /\[t152-windows-formal\].* receipt=([^\r\n]+)/u.exec(output)?.[1];
    if (!receipt) throw new Error('Windows advertisement receipt was not reported');
    const windowsReceiptPath = path.join(evidenceRoot, 'windows-advertise-receipt.json');
    await download(receipt.trim(), windowsReceiptPath);
    const windows = JSON.parse(fs.readFileSync(windowsReceiptPath, 'utf8').replace(/^\uFEFF/u, ''));
    if (windows.resultStatus !== 'success' || windows.groupId !== expected.groupId
        || windows.groupTag !== expected.groupTag || windows.requestSent !== false) {
      throw new Error('Windows advertisement receipt mismatched Mac discovery');
    }
    const locator = { attemptId, completedAt: new Date().toISOString(), expected,
      identity: manifest.identity, macosLibraryPath: preflight.canonicalLibraryPath,
      requestSent: false, resultStatus: 'success', schemaVersion: 1, windows,
      windowsReceiptPath };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`);
    return { locatorPath };
  } catch (error) {
    if (providerReady) {
      await run('ssh', ['-T', ...sshBase(), HOST,
        ...remoteCommand('release-cancel', capsuleAttempt, attemptId)]).catch(() => undefined);
      await provider.done.catch(() => undefined);
    }
    fs.writeFileSync(locatorPath, `${JSON.stringify({ attemptId, error: error.message,
      resultStatus: 'failure', schemaVersion: 1 }, null, 2)}\n`);
    throw Object.assign(error, { locatorPath });
  } finally { await session?.close().catch(() => undefined); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [controllerCommit, capsuleAttempt, attemptId = randomUUID(), productSource, controllerRoot] =
    process.argv.slice(2);
  runWindowsToMacosFind({ attemptId, capsuleAttempt, controllerCommit, controllerRoot,
    productSource }).then(({ locatorPath }) => console.log(
    `[t152-formal-reverse] status=success locator=${locatorPath}`
  )).catch((error) => { console.error(`[t152-formal-reverse] status=failure locator=${error.locatorPath ?? '-'} message=${error.message}`); process.exitCode = 1; });
}
