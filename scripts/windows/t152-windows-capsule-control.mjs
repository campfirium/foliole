#!/usr/bin/env node
/* global console, process */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { formalLaunchEnvHash } from './t152-windows-formal-interactive-contract.mjs';
import { canonicalPrepareJson, createT152WindowsPrepareRequest,
  remoteT152CapsulePaths } from './t152-windows-prepare-request.mjs';
import { runT152WindowsPrepareStages } from './t152-windows-prepare-stages.mjs';

const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';
const PRODUCT_TREE = 'ec8af4a625d98fb35e86134d8770c50a5e669ccb';
const T7_RUN = '33270551363';
const DEFAULT_HOST = 'zephu@192.168.0.11';
const ACTION_PATH = 'scripts/windows/t152-windows-capsule-action.ps1';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk);
      options.onOutput?.(output); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk);
      options.onOutput?.(output); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(
      Object.assign(new Error(`${command} exited ${code}`), { code, output })
    ));
  });
}

function git(repoRoot, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding, maxBuffer: 64 * 1024 * 1024 });
}

function identity(productObjectRepo, controllerRepo, controllerCommit) {
  const productTree = git(productObjectRepo, ['rev-parse', `${PRODUCT_COMMIT}^{tree}`]).trim();
  const controllerTree = git(controllerRepo, ['rev-parse', `${controllerCommit}^{tree}`]).trim();
  if (productTree !== PRODUCT_TREE || !/^[0-9a-f]{40}$/u.test(controllerCommit)
      || !/^[0-9a-f]{40}$/u.test(controllerTree)) throw new Error('capsule identity mismatch');
  return { controllerCommit, controllerTree, productCommit: PRODUCT_COMMIT,
    productTree: PRODUCT_TREE, t7Run: T7_RUN };
}

function archiveFacts(repoRoot, commit, outputPath) {
  execFileSync('git', ['-C', repoRoot, 'archive', '--format=tar', `--output=${outputPath}`, commit]);
  const files = git(repoRoot, ['ls-tree', '-r', '--name-only', commit]).trim().split('\n');
  return { fileCount: files.length, fileListSha256: digest(Buffer.from(`${files.join('\n')}\n`)) };
}

export function createT152Capsule(repoRoot, controllerCommit, capsuleId, productObjectRepo) {
  const root = path.join(repoRoot, '.tmp', 'artifacts', 't152-15-product-capsule', capsuleId);
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.mkdirSync(root, { recursive: false });
  const productArchive = path.join(root, 'product.tar');
  const controllerArchive = path.join(root, 'controller.tar');
  if (!path.isAbsolute(productObjectRepo ?? '')) throw new Error('Product object repo is required');
  const productFiles = archiveFacts(productObjectRepo, PRODUCT_COMMIT, productArchive);
  const controllerFiles = archiveFacts(repoRoot, controllerCommit, controllerArchive);
  const lockfile = git(productObjectRepo, ['show', `${PRODUCT_COMMIT}:package-lock.json`], null);
  const manifest = { archiveSha256: digest(fs.readFileSync(productArchive)),
    controllerArchiveSha256: digest(fs.readFileSync(controllerArchive)), controllerFiles,
    createdAt: new Date().toISOString(),
    identity: identity(productObjectRepo, repoRoot, controllerCommit),
    lockfileSha256: digest(lockfile), productFiles, schemaVersion: 2 };
  const manifestPath = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { controllerArchive, manifest, manifestPath, productArchive, root };
}

function sshBase(env) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY?.trim();
  if (!path.isAbsolute(key ?? '')) throw new Error('Explicit Windows SSH identity is required');
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];
}

async function upload(host, localPath, remotePath, env) {
  await run('scp', ['-q', ...sshBase(env), localPath, `${host}:${remotePath.replaceAll('\\', '/')}`],
    { env });
}

export async function readT152WindowsHostFacts({ controllerRoot, env = process.env,
  host = env.FOLIOLE_WINDOWS_DEV_SSH || DEFAULT_HOST }) {
  const remoteName = `t152-host-facts-${randomUUID()}.ps1`;
  await upload(host, path.join(controllerRoot, ACTION_PATH), remoteName, env);
  const output = await run('ssh', ['-T', ...sshBase(env), host, 'powershell.exe', '-NoProfile',
    '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', remoteName,
    '-Action', 'host-facts'], { env });
  const encoded = /^T152_HOST_FACTS=(.+)$/mu.exec(output)?.[1];
  if (!encoded) throw new Error('source-free Windows host facts are missing');
  return JSON.parse(encoded);
}

async function downloadReceipt(host, remotePath, localPath, env) {
  await run('scp', ['-q', ...sshBase(env), `${host}:${remotePath.replaceAll('\\', '/')}`, localPath],
    { env });
  return JSON.parse(fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/u, ''));
}

export async function prepareT152WindowsCapsule({ capsuleId = randomUUID(), controllerCommit,
  controllerRoot, env = process.env, facts, host = env.FOLIOLE_WINDOWS_DEV_SSH || DEFAULT_HOST,
  productObjectRepo, repoRoot = process.cwd(), rootId }) {
  const capsule = createT152Capsule(repoRoot, controllerCommit, capsuleId, productObjectRepo);
  const hostFacts = facts ?? await readT152WindowsHostFacts({ controllerRoot, env, host });
  const paths = remoteT152CapsulePaths(hostFacts, capsuleId);
  const staging = { action: path.win32.join(hostFacts.roots.userProfile,
    `t152-capsule-action-${capsuleId}.ps1`), actionLocal: path.join(controllerRoot, ACTION_PATH),
    controller: path.win32.join(
    hostFacts.roots.userProfile, `t152-controller-${capsuleId}.tar`), manifest: path.win32.join(
    hostFacts.roots.userProfile, `t152-manifest-${capsuleId}.json`), helper: path.win32.join(
    hostFacts.roots.userProfile, `t152-prepare-stage-${capsuleId}.ps1`),
    helperLocal: path.join(controllerRoot, 'scripts/windows/t152-windows-prepare-stage.ps1'),
    product: path.win32.join(
    hostFacts.roots.userProfile, `t152-product-${capsuleId}.tar`) };
  const preparedRequest = createT152WindowsPrepareRequest({ capsuleId,
    capsuleRoot: paths.capsuleRoot, controllerArchivePath: staging.controller,
    controllerRoot: paths.controllerRoot, evidenceRoot: paths.evidenceRoot,
    hostFactsSha256: digest(canonicalPrepareJson(hostFacts)), identity: capsule.manifest.identity,
    manifestPath: staging.manifest, nodePath: hostFacts.runtime.node,
    npmPath: hostFacts.runtime.npm, prepareHelperPath: staging.helper,
    productArchivePath: staging.product, rootId,
    sourceRoot: paths.sourceRoot, tarPath: hostFacts.runtime.tar });
  const stages = await runT152WindowsPrepareStages({ capsule, env, host,
    hostFactsSha256: digest(canonicalPrepareJson(hostFacts)), paths, preparedRequest,
    sshBase: sshBase(env), staging });
  const final = stages.receipts.at(-1);
  return { capsule, facts: hostFacts, output: final.terminalRecord.receipt.terminal.stdout,
    paths, preflight: stages.preflight.receipt.parsed, preparedRequest,
    receipt: final.receipt, receiptPath: final.localReceipt, staging, stages };
}

function interactiveConfig(prepared, phase, rootId, formal = {}) {
  const { capsule, facts, paths } = prepared;
  const evidenceRoot = path.win32.join(paths.capsuleRoot, 'evidence', 'admission', rootId);
  const stateRoot = path.win32.join(paths.capsuleRoot, 'state', rootId);
  const ownerReceiptPath = path.win32.join(evidenceRoot, `t152-task-root-${rootId}.json`);
  const launchEnv = { sourceRoot: paths.sourceRoot, stateRoot, taskRoot: path.win32.join(
    paths.taskBaseRoot, rootId) };
  return { action: formal.action ?? 't152-prejourney-admission', baseRoot: paths.taskBaseRoot,
    ...(formal.attemptId ? { attemptId: formal.attemptId } : {}),
    capsuleId: path.win32.basename(paths.capsuleRoot), capsuleRoot: paths.capsuleRoot,
    controllerCommit: capsule.manifest.identity.controllerCommit,
    controllerRoot: paths.controllerRoot, controllerTree: capsule.manifest.identity.controllerTree,
    createdAt: new Date().toISOString(), evidenceRoot,
    ...(formal.expectedGroupId ? { expectedGroupId: formal.expectedGroupId,
      expectedGroupTag: formal.expectedGroupTag,
      ...(formal.expectedProviderDeviceId
        ? { expectedProviderDeviceId: formal.expectedProviderDeviceId } : {}) } : {}),
    formalAttempt: formal.attemptId ? { allocated: true, started: true }
      : { allocated: false, started: false }, launchEnvHash: formalLaunchEnvHash(launchEnv),
    nodePath: facts.runtime.node, nonce: randomUUID(), ownerReceiptPath, phase,
    protectedRoots: [paths.sourceRoot, paths.controllerRoot, paths.capsuleRoot, evidenceRoot,
      facts.roots.programFiles, facts.roots.systemRoot], rootId, sourceRoot: paths.sourceRoot,
    stateRoot };
}

export async function runT152WindowsAdmission({ env = process.env,
  host = env.FOLIOLE_WINDOWS_DEV_SSH || DEFAULT_HOST, phase, prepared, rootId }) {
  if (!['g2-path', 'g3-anchor'].includes(phase)) throw new Error('admission phase is invalid');
  const config = interactiveConfig(prepared, phase, rootId);
  const localConfig = path.join(prepared.capsule.root, `${phase}-${rootId}.json`);
  fs.writeFileSync(localConfig, `${JSON.stringify(config, null, 2)}\n`);
  const remoteConfig = path.win32.join(prepared.facts.roots.userProfile,
    `t152-${phase}-${rootId}.json`);
  await upload(host, localConfig, remoteConfig, env);
  const remoteAction = prepared.staging.action;
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', remoteAction, '-Action', phase, '-CapsuleRoot', prepared.paths.capsuleRoot,
    '-ConfigPath', remoteConfig, '-ControllerRoot', prepared.paths.controllerRoot,
    '-EvidenceRoot', config.evidenceRoot, '-NodePath', prepared.facts.runtime.node,
    '-SourceRoot', prepared.paths.sourceRoot];
  const output = await run('ssh', ['-T', ...sshBase(env), host, ...command], { env });
  const localReceipt = path.join(prepared.capsule.root, `${phase}-receipt.json`);
  const receipt = await downloadReceipt(host, path.win32.join(config.evidenceRoot,
    `${phase}-receipt.json`), localReceipt, env);
  if (receipt.resultStatus !== 'success' || receipt.formalAttempt.allocated !== false
      || receipt.formalAttempt.started !== false || receipt.rootId !== rootId) {
    throw new Error(`${phase} receipt is invalid`);
  }
  return { config, localReceipt, output, receipt };
}

export async function runT152WindowsFormal({ action, env = process.env,
  expectedGroupId, expectedGroupTag, expectedProviderDeviceId,
  host = env.FOLIOLE_WINDOWS_DEV_SSH || DEFAULT_HOST,
  onOutput, prepared, rootId }) {
  const config = interactiveConfig(prepared, 'formal', rootId, { action,
    attemptId: rootId, expectedGroupId, expectedGroupTag, expectedProviderDeviceId });
  const localConfig = path.join(prepared.capsule.root, `formal-${rootId}.json`);
  fs.writeFileSync(localConfig, `${JSON.stringify(config, null, 2)}\n`);
  const remoteConfig = path.win32.join(prepared.facts.roots.userProfile,
    `t152-formal-${rootId}.json`);
  await upload(host, localConfig, remoteConfig, env);
  const command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', prepared.staging.action, '-Action', 'formal',
    '-CapsuleRoot', prepared.paths.capsuleRoot, '-ConfigPath', remoteConfig,
    '-ControllerRoot', prepared.paths.controllerRoot, '-EvidenceRoot', config.evidenceRoot,
    '-NodePath', prepared.facts.runtime.node, '-SourceRoot', prepared.paths.sourceRoot];
  const output = await run('ssh', ['-T', ...sshBase(env), host, ...command], { env, onOutput });
  const localReceipt = path.join(prepared.capsule.root, `formal-${rootId}-receipt.json`);
  const receipt = await downloadReceipt(host, path.win32.join(config.evidenceRoot,
    'formal-receipt.json'), localReceipt, env);
  if (receipt.resultStatus !== 'success' || receipt.formalAttempt.allocated !== true
      || receipt.formalAttempt.started !== true || receipt.rootId !== rootId) {
    throw new Error('formal receipt is invalid');
  }
  return { config, localReceipt, output, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [controllerCommit, controllerRoot, productObjectRepo, capsuleId] = process.argv.slice(2);
  prepareT152WindowsCapsule({ capsuleId: capsuleId || randomUUID(), controllerCommit,
    controllerRoot, productObjectRepo }).then(({ capsule }) => console.log(
    `[t152-windows-capsule] status=OK local=${capsule.root}`
  )).catch((error) => { console.error(`[t152-windows-capsule] ${error.message}`); process.exitCode = 1; });
}
