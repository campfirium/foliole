#!/usr/bin/env node
/* global console, process */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';
const PRODUCT_TREE = 'ec8af4a625d98fb35e86134d8770c50a5e669ccb';
const T7_RUN = '33270551363';
const DEFAULT_HOST = 'zephu@192.168.0.11';
const SCRIPT_PATH = 'scripts/windows/t152-windows-capsule-action.ps1';

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

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

function git(repoRoot, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
}

function identity(repoRoot, controllerCommit) {
  const objectType = git(repoRoot, ['cat-file', '-t', PRODUCT_COMMIT]).trim();
  const tree = git(repoRoot, ['rev-parse', `${PRODUCT_COMMIT}^{tree}`]).trim();
  const controllerTree = git(repoRoot, ['rev-parse', `${controllerCommit}^{tree}`]).trim();
  if (objectType !== 'commit' || tree !== PRODUCT_TREE) throw new Error('fixed product identity mismatch');
  if (!/^[0-9a-f]{40}$/u.test(controllerCommit) || !/^[0-9a-f]{40}$/u.test(controllerTree)) {
    throw new Error('controller identity is invalid');
  }
  return { controllerCommit, controllerTree, productCommit: PRODUCT_COMMIT,
    productTree: PRODUCT_TREE, t7Run: T7_RUN };
}

function createCapsule(repoRoot, controllerCommit, attemptId) {
  const parent = path.join(repoRoot, '.tmp', 'artifacts', 't152-15-product-capsule');
  const root = path.join(parent, attemptId);
  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(root, { recursive: false });
  const archivePath = path.join(root, 'product.tar');
  execFileSync('git', ['-C', repoRoot, 'archive', '--format=tar', `--output=${archivePath}`, PRODUCT_COMMIT]);
  const files = git(repoRoot, ['ls-tree', '-r', '--name-only', PRODUCT_COMMIT]).trim().split('\n');
  const list = `${files.join('\n')}\n`;
  const lockfile = git(repoRoot, ['show', `${PRODUCT_COMMIT}:package-lock.json`], null);
  const controller = git(repoRoot, ['show', `${controllerCommit}:${SCRIPT_PATH}`], null);
  const scriptPath = path.join(root, 'controller.ps1');
  fs.writeFileSync(scriptPath, controller);
  const manifest = { archiveSha256: digest(fs.readFileSync(archivePath)),
    controllerScriptSha256: digest(controller), createdAt: new Date().toISOString(),
    fileCount: files.length, fileListSha256: digest(Buffer.from(list)),
    identity: identity(repoRoot, controllerCommit), lockfileSha256: digest(lockfile),
    schemaVersion: 1 };
  const manifestPath = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { archivePath, manifest, manifestPath, root, scriptPath };
}

function sshBase(env = process.env) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];
}

async function upload(host, localPath, remoteName, env) {
  await run('scp', ['-q', ...sshBase(env), localPath, `${host}:${remoteName}`], { env });
}

async function downloadReceipt(host, output, localPath, env) {
  const match = / receipt=([^\r\n]+)/u.exec(output);
  if (!match) throw new Error('Windows capsule receipt was not reported');
  const remotePath = match[1].trim().replaceAll('\\', '/');
  if (!/\/Foliole\/windows-dev-control\/capsules\/[0-9a-f-]{36}\/evidence\/[a-z-]+-receipt\.json$/iu
    .test(remotePath)) throw new Error('Windows capsule receipt escaped its task-owned root');
  await run('scp', ['-q', ...sshBase(env), `${host}:${remotePath}`, localPath], { env });
  return JSON.parse(fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/u, ''));
}

function remoteCommand(action, attemptId) {
  const args = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', 't152-windows-capsule-action.ps1', '-Action', action, '-AttemptId', attemptId];
  if (action === 'prepare') args.push('-ArchiveName', `t152-product-${attemptId}.tar`,
    '-ManifestName', `t152-manifest-${attemptId}.json`);
  return args;
}

export async function runT152WindowsCapsule({ action, attemptId = randomUUID(),
  controllerCommit, env = process.env, host = env.FOLIOLE_WINDOWS_DEV_SSH || DEFAULT_HOST,
  repoRoot = process.cwd() }) {
  if (!['host-facts', 'prepare'].includes(action)) throw new Error('action must be host-facts or prepare');
  if (!/^[0-9a-f-]{36}$/u.test(attemptId)) throw new Error('attempt id is invalid');
  const capsule = createCapsule(repoRoot, controllerCommit, attemptId);
  await upload(host, capsule.scriptPath, 't152-windows-capsule-action.ps1', env);
  if (action === 'prepare') {
    await upload(host, capsule.archivePath, `t152-product-${attemptId}.tar`, env);
    await upload(host, capsule.manifestPath, `t152-manifest-${attemptId}.json`, env);
  }
  const output = await run('ssh', ['-T', ...sshBase(env), host, ...remoteCommand(action, attemptId)], { env });
  fs.writeFileSync(path.join(capsule.root, `${action}.log`), output);
  const receiptPath = path.join(capsule.root, `${action}-receipt.json`);
  const receipt = await downloadReceipt(host, output, receiptPath, env);
  if (receipt.action !== action || receipt.attemptId !== attemptId
      || receipt.resultStatus !== 'success') throw new Error('Windows capsule receipt is not successful');
  return { attemptId, capsule, output, receipt, receiptPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [action, controllerCommit, attemptId] = process.argv.slice(2);
  runT152WindowsCapsule({ action, attemptId: attemptId || randomUUID(), controllerCommit })
    .then(({ attemptId: id, capsule }) => console.log(
      `[t152-windows-capsule] status=OK action=${action} attempt=${id} local=${capsule.root}`
    ))
    .catch((error) => { console.error(`[t152-windows-capsule] ${error.message}`); process.exitCode = 1; });
}
