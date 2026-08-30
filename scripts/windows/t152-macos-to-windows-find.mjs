#!/usr/bin/env node
/* global console, process, URL */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = 'zephu@192.168.0.11';
const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';
const PRODUCT_TREE = 'ec8af4a625d98fb35e86134d8770c50a5e669ccb';
const T7_RUN = '33270551363';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(
      Object.assign(new Error(`${command} exited ${code}`), { code, output })
    ));
  });
}

function sshBase() {
  const key = process.env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];
}

async function upload(filePath, remoteName) {
  await run('scp', ['-q', ...sshBase(), filePath, `${HOST}:${remoteName}`]);
}

async function download(remotePath, localPath) {
  await run('scp', ['-q', ...sshBase(), `${HOST}:${remotePath.replaceAll('\\', '/')}`, localPath]);
}

function exactManifest(repoRoot, capsuleAttempt, controllerCommit) {
  const manifestPath = path.join(repoRoot, '.tmp', 'artifacts', 't152-15-product-capsule',
    capsuleAttempt, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const identity = manifest.identity;
  if (identity.productCommit !== PRODUCT_COMMIT || identity.productTree !== PRODUCT_TREE
      || identity.t7Run !== T7_RUN || identity.controllerCommit !== controllerCommit) {
    throw new Error('formal product/controller manifest mismatch');
  }
  return { identity, manifestPath };
}

async function productModules(productSource) {
  const url = pathToFileURL(productSource);
  return Promise.all([
    import(new URL('scripts/android/macos-sync-group-desktop-session.mjs', `${url.href}/`)),
    import(new URL('scripts/desktop/t152-desktop-dnssd-library.mjs', `${url.href}/`)),
    import(new URL('scripts/sync-group/multi-device-sync-macos-channel.mjs', `${url.href}/`))
  ]);
}

function deviceIdentity(group, preflight) {
  const key = group?.local_device_identity_key;
  const parsed = JSON.parse(key ?? 'null');
  if (!Array.isArray(parsed) || parsed[3] !== preflight.canonicalLibraryPath) {
    throw new Error('Mac formal Device identity diverged from canonical library path');
  }
  return key;
}

async function remoteFind({ capsuleAttempt, controllerRoot, group, attemptId }) {
  await upload(path.join(controllerRoot, 'scripts/windows/t152-windows-capsule-action.ps1'),
    't152-windows-capsule-action.ps1');
  await upload(path.join(controllerRoot, 'scripts/windows/t152-windows-capsule-formal-runner.mjs'),
    't152-windows-capsule-formal-runner.mjs');
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', 't152-windows-capsule-action.ps1', '-Action', 'find-acceptance',
    '-AttemptId', attemptId, '-CapsuleAttemptId', capsuleAttempt,
    '-ExpectedGroupId', group.group_id, '-ExpectedGroupTag', group.group_tag];
  return run('ssh', ['-T', ...sshBase(), HOST, ...command]);
}

export async function runMacosToWindowsFind({ attemptId, capsuleAttempt, controllerCommit,
  controllerRoot, productSource, repoRoot = process.cwd() }) {
  const { identity } = exactManifest(repoRoot, capsuleAttempt, controllerCommit);
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 't152-15-formal-find', attemptId);
  fs.mkdirSync(evidenceRoot, { recursive: false });
  const [macos, libraryOwner, channel] = await productModules(productSource);
  const library = libraryOwner.createT152DesktopDnsSdLibrary({ attemptId,
    baseRoot: '/private/tmp/foliole-t152-libraries', evidenceRoot, sourceRoot: productSource });
  const session = await macos.openMacosSyncGroupDesktopSession({ env: channel.macosAcceptanceEnv(),
    libraryHome: library.libraryHome, operationId: attemptId, repoRoot: productSource,
    runtimeLogPath: path.join(evidenceRoot, 'macos-runtime.log'),
    runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
  const locatorPath = path.join(evidenceRoot, 'locator.json');
  try {
    const preflight = await session.loadDnsSdIdentityPreflight(`group-${randomUUID()}`);
    const group = (await session.enable()).sync_group;
    const macosDeviceIdentity = deviceIdentity(group, preflight);
    const bytes = await session.validateDnsSdIdentity(macosDeviceIdentity);
    if (bytes !== preflight.deviceIdTxtEntryBytes) throw new Error('Mac TXT preflight changed');
    const output = await remoteFind({ capsuleAttempt, controllerRoot, group, attemptId });
    const receiptMatch = /\[t152-windows-formal\].* receipt=([^\r\n]+)/u.exec(output);
    if (!receiptMatch) throw new Error('Windows formal Find receipt was not reported');
    const windowsReceiptPath = path.join(evidenceRoot, 'windows-find-receipt.json');
    await download(receiptMatch[1].trim(), windowsReceiptPath);
    const windows = JSON.parse(fs.readFileSync(windowsReceiptPath, 'utf8').replace(/^\uFEFF/u, ''));
    if (windows.resultStatus !== 'success' || windows.groupId !== group.group_id
        || windows.groupTag !== group.group_tag || windows.requestSent !== false) {
      throw new Error('Windows formal Find receipt mismatched the Mac advertisement');
    }
    const locator = { attemptId, completedAt: new Date().toISOString(), deviceIdTxtEntryBytes: bytes,
      groupId: group.group_id, groupTag: group.group_tag, identity,
      macosDeviceIdentity, macosLibraryPath: library.libraryHome, macosProcessId: session.processId,
      requestSent: false, resultStatus: 'success', schemaVersion: 1, windows,
      windowsReceiptPath };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`);
    return { locator, locatorPath };
  } catch (error) {
    fs.writeFileSync(locatorPath, `${JSON.stringify({ attemptId, error: error.message, identity,
      resultStatus: 'failure', schemaVersion: 1 }, null, 2)}\n`);
    throw Object.assign(error, { locatorPath });
  } finally {
    await session.close().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [controllerCommit, capsuleAttempt, attemptId, productSource, controllerRoot] =
    process.argv.slice(2);
  runMacosToWindowsFind({ attemptId, capsuleAttempt, controllerCommit, controllerRoot,
    productSource }).then(({ locatorPath }) => console.log(
    `[t152-formal-find] status=success locator=${locatorPath}`
  )).catch((error) => {
    console.error(`[t152-formal-find] status=failure message=${error.message} locator=${error.locatorPath ?? '-'}`);
    process.exitCode = 1;
  });
}
