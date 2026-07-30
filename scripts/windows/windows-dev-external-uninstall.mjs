#!/usr/bin/env node
/* global console, process */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSnapshotEqual, parseExternalUninstallArgs, PRESERVED_OLD_ROOT_CHILDREN,
  removeLegacyKeyLine, REMOVED_OLD_ROOT_CHILDREN, validateAuthorizedKeys,
  validateHostSnapshot, validateOldRootInventory
} from './windows-dev-external-uninstall-core.mjs';
import { inspectExternalUninstallHost } from './windows-dev-external-uninstall-host.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');

function failure(message, exitCode = 64, failureStage = 'preflight') {
  return Object.assign(new Error(message), { exitCode, failureStage });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', shell: false, timeout: 30_000, windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw failure(String(result.error?.message || result.stderr || result.stdout || `${command} failed`).trim(), 74, 'command');
  }
  return result.stdout.trim();
}

function fileHash(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function directorySnapshot(root) {
  const hash = createHash('sha256');
  const totals = { directories: 0, files: 0, totalBytes: 0 };
  function visit(directory, relative = '') {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childRelative = path.win32.join(relative, entry.name);
      const childPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw failure(`preserved directory contains a symbolic link: ${childRelative}`);
      if (entry.isDirectory()) {
        totals.directories += 1;
        hash.update(`d:${childRelative}\n`);
        visit(childPath, childRelative);
      } else if (entry.isFile()) {
        const stat = fs.statSync(childPath);
        totals.files += 1;
        totals.totalBytes += stat.size;
        hash.update(`f:${childRelative}:${stat.size}:`);
        hash.update(fs.readFileSync(childPath));
      } else throw failure(`preserved directory contains an unsupported entry: ${childRelative}`);
    }
  }
  visit(root);
  return { ...totals, lastWriteTimeMs: fs.statSync(root).mtimeMs, treeSha256: hash.digest('hex') };
}

function oldRootInventory(oldRoot) {
  if (!fs.existsSync(oldRoot) || !fs.statSync(oldRoot).isDirectory()) throw failure('old AppData root is missing');
  return fs.readdirSync(oldRoot, { withFileTypes: true }).map((entry) => ({
    name: entry.name, type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'unsupported'
  }));
}

function preservedSnapshot(oldRoot) {
  return Object.fromEntries(PRESERVED_OLD_ROOT_CHILDREN.map((name) => {
    const target = path.join(oldRoot, name);
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw failure(`preserved directory is missing: ${name}`);
    return [name, directorySnapshot(target)];
  }));
}

function systemNodeSnapshot(paths, host) {
  const actualNode = fs.realpathSync.native(process.execPath);
  if (actualNode.toLowerCase() !== fs.realpathSync.native(paths.systemNode).toLowerCase()) {
    throw failure('one-off uninstall is not running under the fixed system Node');
  }
  if (!fs.existsSync(paths.systemNpm) || run(paths.systemNode, ['--version']) !== 'v22.23.2') {
    throw failure('fixed system Node/npm identity is unavailable');
  }
  const packageIdentity = validateHostSnapshot(host, paths.oldLabRoot, Boolean(host.scheduledTask));
  return { nodePath: actualNode, nodeSha256: fileHash(actualNode), npmPath: fs.realpathSync.native(paths.systemNpm),
    packageIdentity, signature: host.nodeSignature, version: 'v22.23.2' };
}

function repositorySnapshot(paths) {
  const branch = run(paths.gitPath, ['-C', paths.repoRoot, 'branch', '--show-current']);
  const head = run(paths.gitPath, ['-C', paths.repoRoot, 'rev-parse', 'HEAD']);
  const upstream = run(paths.gitPath, ['-C', paths.repoRoot, 'rev-parse', '--abbrev-ref', '@{upstream}']);
  const bareHead = run(paths.gitPath, ['--git-dir', paths.bareRepository, 'rev-parse', 'refs/heads/dev']);
  if (branch !== 'dev' || upstream !== 'lan/dev' || head !== bareHead || !fs.existsSync(paths.receiver)) {
    throw failure('new Git receiver and single working repository are not aligned');
  }
  return { bareHead, branch, head, receiverPath: fs.realpathSync.native(paths.receiver), upstream };
}

function evidenceRoot(now = () => new Date(), id = randomUUID) {
  const runId = `${now().toISOString().replace(/[-:.TZ]/gu, '')}-${id().slice(0, 8)}`;
  const root = path.join(REPO_ROOT, '.tmp', 'artifacts', 'windows-android-dev', runId);
  fs.mkdirSync(root, { recursive: true });
  return { manifestPath: path.join(root, 'external-uninstall-manifest.json'), root, runId };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function manifestForDryRun(paths) {
  const host = inspectExternalUninstallHost(paths.oldLabRoot);
  validateHostSnapshot(host, paths.oldLabRoot, true);
  const inventory = validateOldRootInventory(oldRootInventory(paths.oldLabRoot));
  const authorizedText = fs.readFileSync(paths.authorizedKeys, 'utf8');
  const context = evidenceRoot();
  return {
    authorizedKeys: { ...validateAuthorizedKeys(authorizedText), path: fs.realpathSync.native(paths.authorizedKeys) },
    createdAt: new Date().toISOString(), deleteTargets: REMOVED_OLD_ROOT_CHILDREN.map((name) => ({
      name, path: path.join(paths.oldLabRoot, name), type: inventory.find((entry) => entry.name === name).type
    })),
    host, mode: 'dry-run', oldRoot: fs.realpathSync.native(paths.oldLabRoot),
    preserve: preservedSnapshot(paths.oldLabRoot), repository: repositorySnapshot(paths),
    recovery: [
      'revert the repository commit that removed the legacy Lab control plane',
      'pull the restored dev branch through the ordinary Windows repository',
      'rerun install-windows-android-lab.ps1 with the original shell and Git public keys'
    ],
    runId: context.runId, schemaVersion: 1, systemNode: systemNodeSnapshot(paths, host),
    task: host.scheduledTask, manifestPath: context.manifestPath
  };
}

function readManifest(manifestPath) {
  const resolved = path.win32.resolve(manifestPath);
  const allowedRoot = path.win32.resolve(REPO_ROOT, '.tmp', 'artifacts', 'windows-android-dev');
  if (!resolved.toLowerCase().startsWith(`${allowedRoot.toLowerCase()}\\`)) throw failure('manifest is outside the DEV evidence root');
  const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.mode !== 'dry-run' || manifest.manifestPath !== resolved) {
    throw failure('external uninstall manifest identity is invalid');
  }
  return manifest;
}

function inspectCurrent(paths, requireTask) {
  const host = inspectExternalUninstallHost(paths.oldLabRoot);
  validateHostSnapshot(host, paths.oldLabRoot, requireTask);
  const authorizedText = fs.readFileSync(paths.authorizedKeys, 'utf8');
  return { authorizedText, authorizedKeys: validateAuthorizedKeys(authorizedText), host,
    inventory: validateOldRootInventory(oldRootInventory(paths.oldLabRoot), !requireTask),
    preserve: preservedSnapshot(paths.oldLabRoot), repository: repositorySnapshot(paths),
    systemNode: systemNodeSnapshot(paths, host) };
}

function validateAgainstManifest(current, manifest, requireTask) {
  assertSnapshotEqual(current.preserve, manifest.preserve, 'preserved directories');
  assertSnapshotEqual(current.repository, manifest.repository, 'new Git repository');
  assertSnapshotEqual(current.systemNode, manifest.systemNode, 'system Node identity');
  if (current.authorizedKeys.contentSha256 !== manifest.authorizedKeys.contentSha256 && requireTask) {
    throw failure('authorized_keys changed after dry-run');
  }
  if (requireTask) assertSnapshotEqual(current.host.scheduledTask, manifest.task, 'scheduled task');
}

function writeAuthorizedKeys(paths, content) {
  const temporary = `${paths.authorizedKeys}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, paths.authorizedKeys);
  run('icacls.exe', [paths.authorizedKeys, '/inheritance:r', '/grant', '*S-1-5-32-544:F', '/grant', 'SYSTEM:F']);
}

function applyUninstall(paths, manifest) {
  const current = inspectCurrent(paths, true);
  validateAgainstManifest(current, manifest, true);
  run('schtasks.exe', ['/Delete', '/TN', 'FolioleAndroidLab', '/F']);
  const nextKeys = removeLegacyKeyLine(current.authorizedText, manifest.authorizedKeys);
  if (nextKeys !== current.authorizedText) writeAuthorizedKeys(paths, nextKeys);
  for (const target of manifest.deleteTargets) {
    if (path.win32.dirname(target.path).toLowerCase() !== path.win32.resolve(paths.oldLabRoot).toLowerCase()
      || !REMOVED_OLD_ROOT_CHILDREN.includes(target.name)
      || path.win32.basename(target.path) !== target.name) throw failure('delete target escaped the approved old root');
    fs.rmSync(target.path, { force: false, recursive: target.type === 'directory' });
  }
  const verified = inspectCurrent(paths, false);
  assertSnapshotEqual(verified.preserve, manifest.preserve, 'preserved directories');
  assertSnapshotEqual(verified.systemNode, manifest.systemNode, 'system Node identity');
  return verified;
}

export function runExternalUninstall({ argv = process.argv.slice(2), paths = windowsDevPaths() } = {}) {
  if (process.platform !== 'win32') throw failure('external uninstall requires Windows', 64, 'platform');
  const request = parseExternalUninstallArgs(argv);
  if (request.mode === 'dry-run') {
    const manifest = manifestForDryRun(paths);
    writeJson(manifest.manifestPath, manifest);
    return { deleteTargets: manifest.deleteTargets, manifestPath: manifest.manifestPath, mode: 'dry-run',
      preserve: Object.keys(manifest.preserve), recovery: manifest.recovery, runId: manifest.runId };
  }
  const manifest = readManifest(request.manifestPath);
  const verified = request.mode === 'apply' ? applyUninstall(paths, manifest) : inspectCurrent(paths, false);
  if (request.mode === 'verify') validateAgainstManifest(verified, manifest, false);
  const result = { completedAt: new Date().toISOString(), manifestPath: manifest.manifestPath,
    mode: request.mode, preserved: Object.keys(verified.preserve), resultStatus: 'success', schemaVersion: 1 };
  writeJson(path.join(path.dirname(manifest.manifestPath), `external-uninstall-${request.mode}.json`), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(runExternalUninstall())); }
  catch (error) {
    console.error(`[windows-dev-external-uninstall] status: FAILED stage=${error.failureStage || 'entry'} message=${error.message}`);
    process.exitCode = error.exitCode || 125;
  }
}
