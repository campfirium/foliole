#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseCutoverArgs, preReceiveHook, replaceForcedKeyLine, signingIdentity,
  validateCutoverSnapshot
} from './windows-dev-cutover-core.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const DEV_FETCH_SPEC = '+refs/heads/dev:refs/remotes/lan/dev';

function commandFailure(message, stage = 'command') {
  return Object.assign(new Error(message), { exitCode: 74, stage });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', shell: false, timeout: 30_000, windowsHide: true, ...options
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || `${command} failed`;
    throw commandFailure(String(detail).trim());
  }
  return result.stdout.trim();
}

function git(paths, args, gitDir = null) {
  const prefix = gitDir ? ['--git-dir', gitDir] : ['-C', paths.repoRoot];
  return run(paths.gitPath, [...prefix, ...args]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, ''));
}

function writeAtomic(filePath, content) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
}

function fileHash(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sourceReceiver() {
  return path.join(REPO_ROOT, 'scripts', 'windows', 'windows-dev-receive.mjs');
}

function backupPath(paths) {
  return path.join(paths.gitRoot, 'cutover-backup.json');
}

function setRemoteFetch(paths, fetchSpecs) {
  if (!Array.isArray(fetchSpecs) || fetchSpecs.length === 0) {
    throw commandFailure('remote fetch backup is missing', 'rollback');
  }
  git(paths, ['config', '--replace-all', 'remote.lan.fetch', fetchSpecs[0]]);
  for (const fetchSpec of fetchSpecs.slice(1)) {
    git(paths, ['config', '--add', 'remote.lan.fetch', fetchSpec]);
  }
}

function inspect(paths) {
  const receiverSource = sourceReceiver();
  const authorizedText = fs.readFileSync(paths.authorizedKeys, 'utf8');
  const authorizedLines = authorizedText.split(/\r?\n/u).filter(Boolean);
  const config = readJson(paths.oldConfig);
  const oldRefSha = git(paths, ['rev-parse', 'refs/heads/lab/dev'], paths.oldBareRepository);
  const canonicalKeystore = fs.realpathSync.native(paths.signingKeystore);
  const key = replaceForcedKeyLine(authorizedLines, paths);
  const signing = signingIdentity(config, paths, fileHash(paths.signingKeystore), canonicalKeystore);
  const snapshot = {
    branch: git(paths, ['branch', '--show-current']),
    gitExists: fs.existsSync(paths.gitPath), head: git(paths, ['rev-parse', 'HEAD']),
    newBareExists: fs.existsSync(paths.bareRepository), nodeExists: fs.existsSync(paths.systemNode),
    npmExists: fs.existsSync(paths.systemNpm), oldBareExists: fs.existsSync(paths.oldBareRepository),
    oldBareRepository: paths.oldBareRepository, oldRefSha,
    receiverSourceExists: fs.existsSync(receiverSource), remoteUrl: git(paths, ['remote', 'get-url', 'lan']),
    repoRoot: paths.repoRoot, signingKeystoreExists: fs.existsSync(paths.signingKeystore)
  };
  const plan = validateCutoverSnapshot(snapshot);
  return { authorizedLines, authorizedText, config, key, plan, receiverSource, signing, snapshot };
}

function secureAuthorizedKeys(paths) {
  run('icacls.exe', [
    paths.authorizedKeys, '/inheritance:r', '/grant', '*S-1-5-32-544:F', '/grant', 'SYSTEM:F'
  ]);
}

function createBackup(paths, inspected) {
  const manifestExists = fs.existsSync(paths.signingManifest);
  return {
    authorizedKeys: inspected.authorizedText,
    hook: fs.readFileSync(path.join(paths.oldBareRepository, 'hooks', 'pre-receive'), 'utf8'),
    manifest: manifestExists ? fs.readFileSync(paths.signingManifest, 'utf8') : null,
    oldBranch: inspected.snapshot.branch,
    oldFetch: git(paths, ['config', '--get-all', 'remote.lan.fetch']).split(/\r?\n/u),
    oldRefSha: inspected.snapshot.oldRefSha,
    oldRemote: inspected.snapshot.remoteUrl,
    schemaVersion: 1
  };
}

function applyCutover(paths, inspected) {
  fs.mkdirSync(paths.gitRoot, { recursive: false });
  writeAtomic(backupPath(paths), `${JSON.stringify(createBackup(paths, inspected), null, 2)}\n`);
  fs.renameSync(paths.oldBareRepository, paths.bareRepository);
  fs.copyFileSync(inspected.receiverSource, paths.receiver);
  writeAtomic(path.join(paths.bareRepository, 'hooks', 'pre-receive'), preReceiveHook());
  git(paths, ['config', 'receive.denyDeletes', 'true'], paths.bareRepository);
  git(paths, ['config', 'receive.denyNonFastForwards', 'true'], paths.bareRepository);
  git(paths, ['update-ref', 'refs/heads/dev', inspected.snapshot.oldRefSha], paths.bareRepository);
  writeAtomic(paths.signingManifest, `${JSON.stringify(inspected.signing, null, 2)}\n`);
  git(paths, ['branch', '-m', 'dev']);
  git(paths, ['remote', 'set-url', 'lan', paths.bareRepository]);
  setRemoteFetch(paths, [DEV_FETCH_SPEC]);
  git(paths, ['fetch', 'lan', DEV_FETCH_SPEC]);
  git(paths, ['branch', '--set-upstream-to=lan/dev', 'dev']);
  writeAtomic(paths.authorizedKeys, `${inspected.key.lines.join('\n')}\n`);
  secureAuthorizedKeys(paths);
  return { branch: 'dev', head: inspected.snapshot.oldRefSha, keySha256: inspected.key.keySha256,
    receiver: paths.receiver, repository: paths.bareRepository, signingManifest: paths.signingManifest };
}

function restoreManifest(paths, backup) {
  if (backup.manifest === null) {
    if (fs.existsSync(paths.signingManifest)) fs.unlinkSync(paths.signingManifest);
  } else {
    writeAtomic(paths.signingManifest, backup.manifest);
  }
}

function rollbackCutover(paths) {
  const backupFile = backupPath(paths);
  if (!fs.existsSync(backupFile)) throw commandFailure('cutover backup is missing', 'rollback');
  const backup = readJson(backupFile);
  writeAtomic(paths.authorizedKeys, backup.authorizedKeys);
  secureAuthorizedKeys(paths);
  if (git(paths, ['branch', '--show-current']) === 'dev') git(paths, ['branch', '-m', backup.oldBranch]);
  git(paths, ['remote', 'set-url', 'lan', backup.oldRemote]);
  setRemoteFetch(paths, backup.oldFetch);
  writeAtomic(path.join(paths.bareRepository, 'hooks', 'pre-receive'), backup.hook);
  git(paths, ['update-ref', '-d', 'refs/heads/dev'], paths.bareRepository);
  if (fs.existsSync(paths.receiver)) fs.unlinkSync(paths.receiver);
  fs.renameSync(paths.bareRepository, paths.oldBareRepository);
  restoreManifest(paths, backup);
  fs.unlinkSync(backupFile);
  fs.rmdirSync(paths.gitRoot);
  return { branch: backup.oldBranch, repository: paths.oldBareRepository, status: 'rolled-back' };
}

function finalizeCutover(paths) {
  if (!fs.existsSync(backupPath(paths)) || !fs.existsSync(paths.bareRepository)) {
    throw commandFailure('active cutover backup or repository is missing', 'finalize');
  }
  git(paths, ['update-ref', '-d', 'refs/heads/lab/dev'], paths.bareRepository);
  fs.unlinkSync(backupPath(paths));
  return { repository: paths.bareRepository, status: 'finalized' };
}

export function runWindowsDevCutover({ argv = process.argv.slice(2), paths = windowsDevPaths() } = {}) {
  const { mode } = parseCutoverArgs(argv);
  if (process.platform !== 'win32') throw commandFailure('cutover requires Windows', 'platform');
  if (mode === 'rollback') return rollbackCutover(paths);
  if (mode === 'finalize') return finalizeCutover(paths);
  const inspected = inspect(paths);
  if (mode === 'dry-run') return {
    actions: inspected.plan.actions, branch: inspected.snapshot.branch,
    head: inspected.snapshot.head, keySha256: inspected.key.keySha256, mode,
    newRepository: paths.bareRepository, oldRepository: paths.oldBareRepository,
    rollbackOrder: inspected.plan.rollbackOrder, schemaVersion: 1
  };
  try {
    return { ...applyCutover(paths, inspected), mode, schemaVersion: 1, status: 'applied' };
  } catch (error) {
    if (fs.existsSync(backupPath(paths))) rollbackCutover(paths);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(runWindowsDevCutover()));
  } catch (error) {
    console.error(`[windows-dev-cutover] ${error.message}`);
    process.exitCode = error.exitCode || 125;
  }
}
