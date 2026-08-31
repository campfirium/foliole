#!/usr/bin/env node
/* global console, process */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createInteractiveConfig, createInteractiveEnvelope, interactiveRemoteCommand } from
  './t152-windows-interactive-envelope.mjs';
import { canonicalPrepareJson, remoteT152CapsulePaths } from
  './t152-windows-prepare-request.mjs';
import { runT152WindowsPrepareStages } from './t152-windows-prepare-stages.mjs';
import { captureSourceFreeHostFacts } from './t152-windows-transfer-journal.mjs';
import { windowsDevTransportIdentity } from './windows-dev-remote-spec.mjs';

const PRODUCT_COMMIT = '86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a';
const PRODUCT_TREE = 'ec8af4a625d98fb35e86134d8770c50a5e669ccb';
const T7_RUN = '33270551363';
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

export async function readT152WindowsHostFacts({ controllerRoot, env = process.env,
  host, receiptRoot, transport = windowsDevTransportIdentity({ env, host }) }) {
  return captureSourceFreeHostFacts({ actionLocal: path.join(controllerRoot, ACTION_PATH),
    deadlineAt: Date.now() + 60_000, env, host: transport.host,
    receiptFile: receiptRoot ? path.join(receiptRoot, 'g1-host-facts-terminal.json') : null,
    sshBase: transport.options });
}

async function downloadReceipt(transport, remotePath, localPath, env) {
  await run('scp', ['-q', ...transport.options,
    `${transport.host}:${remotePath.replaceAll('\\', '/')}`, localPath],
    { env });
  return JSON.parse(fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/u, ''));
}

export async function prepareT152WindowsCapsule({ capsuleId = randomUUID(), controllerCommit,
  controllerRoot, env = process.env, facts, host,
  productObjectRepo, repoRoot = process.cwd(), rootId }) {
  const transport = windowsDevTransportIdentity({ env, host });
  const capsule = createT152Capsule(repoRoot, controllerCommit, capsuleId, productObjectRepo);
  const hostFactsResult = facts ? { facts, receipt: null }
    : await readT152WindowsHostFacts({ controllerRoot, env, receiptRoot: capsule.root, transport });
  const hostFacts = hostFactsResult.facts;
  const paths = remoteT152CapsulePaths(hostFacts, capsuleId);
  const controlRoot = path.win32.join(hostFacts.roots.userProfile, `t152-control-${capsuleId}`);
  const staging = { action: path.win32.join(controlRoot, 't152-windows-capsule-action.ps1'),
    actionLocal: path.join(controllerRoot, ACTION_PATH), contract: path.win32.join(controlRoot,
      't152-windows-prepare-stage-contract.mjs'), contractLocal: path.join(controllerRoot,
      'scripts/windows/t152-windows-prepare-stage-contract.mjs'),
    controller: path.win32.join(
    hostFacts.roots.userProfile, `t152-controller-${capsuleId}.tar`), manifest: path.win32.join(
    hostFacts.roots.userProfile, `t152-manifest-${capsuleId}.json`),
    product: path.win32.join(
    hostFacts.roots.userProfile, `t152-product-${capsuleId}.tar`), remoteBaseRoot:
    hostFacts.roots.userProfile, request: path.win32.join(controlRoot,
      't152-windows-prepare-request.mjs'), requestLocal: path.join(controllerRoot,
      'scripts/windows/t152-windows-prepare-request.mjs'), runner: path.win32.join(controlRoot,
      't152-windows-prepare-stage-runner.mjs'),
    runnerLocal: path.join(controllerRoot, 'scripts/windows/t152-windows-prepare-stage-runner.mjs'),
    npmOwnerLocal: path.join(controllerRoot, 'scripts/windows/t152-windows-npm-runtime-owner.mjs'),
    transfer: path.win32.join(controlRoot, 't152-windows-transfer-journal.mjs'),
    transferLocal: path.join(controllerRoot, 'scripts/windows/t152-windows-transfer-journal.mjs'),
    collectionsLocal: path.join(controllerRoot, 'scripts/windows/t152-windows-control-bundle-collections.ps1'),
    parser: path.win32.join(controlRoot, 't152-windows-script-parser.ps1'),
    parserLocal: path.join(controllerRoot, 'scripts/windows/t152-windows-script-parser.ps1'),
    interactiveLocal: path.join(controllerRoot,
      'scripts/windows/t152-windows-interactive-envelope.ps1'),
    verifierLocal: path.join(controllerRoot,
      'scripts/windows/t152-windows-control-bundle-verification.ps1') };
  const prepareRequestInput = { capsuleId,
    capsuleRoot: paths.capsuleRoot, controllerArchivePath: staging.controller,
    controllerRoot: paths.controllerRoot, evidenceRoot: paths.evidenceRoot,
    hostFactsSha256: digest(canonicalPrepareJson(hostFacts)), identity: capsule.manifest.identity,
    manifestPath: staging.manifest, nodePath: hostFacts.runtime.nodePath,
    npmCommandPath: hostFacts.runtime.npmCommandPath,
    productArchivePath: staging.product, rootId, sourceRoot: paths.sourceRoot,
    stageRunnerPath: staging.runner, tarPath: hostFacts.runtime.tarPath };
  const stages = await runT152WindowsPrepareStages({ capsule, env, host: transport.host,
    hostFactsSha256: digest(canonicalPrepareJson(hostFacts)), paths, prepareRequestInput,
    sshBase: transport.options, staging });
  const preparedRequest = stages.preparedRequest;
  const final = stages.receipts.at(-1);
  return { capsule, facts: hostFacts, output: final.terminalRecord.receipt.terminal.stdout,
    paths, preflight: stages.preflight.receipt.parsed, preparedRequest,
    receipt: final.receipt, receiptPath: final.localReceipt, staging, stages, transport };
}

async function runInteractiveEntry({ env, formal = {}, onOutput, phase, prepared, rootId }) {
  const config = createInteractiveConfig(prepared, phase, rootId, formal);
  const envelope = createInteractiveEnvelope(config);
  const localConfig = path.join(prepared.capsule.root, `${phase}-${rootId}.json`);
  fs.writeFileSync(localConfig, `${envelope.configJson}\n`);
  const command = interactiveRemoteCommand(prepared.staging.action, phase, envelope.token);
  const output = await run('ssh', ['-T', ...prepared.transport.options,
    prepared.transport.host, ...command], { env, onOutput });
  return { config, envelope, output };
}

export async function runT152WindowsAdmission({ env = process.env,
  phase, prepared, rootId }) {
  if (!['g2-path', 'g3-anchor'].includes(phase)) throw new Error('admission phase is invalid');
  const entry = await runInteractiveEntry({ env, phase, prepared, rootId });
  const localReceipt = path.join(prepared.capsule.root, `${phase}-receipt.json`);
  const receipt = await downloadReceipt(prepared.transport, path.win32.join(entry.config.evidenceRoot,
    `${phase}-receipt.json`), localReceipt, env);
  if (receipt.resultStatus !== 'success' || receipt.formalAttempt.allocated !== false
      || receipt.formalAttempt.started !== false || receipt.rootId !== rootId) {
    throw new Error(`${phase} receipt is invalid`);
  }
  return { ...entry, localReceipt, receipt };
}

export async function runT152WindowsFormal({ action, env = process.env,
  expectedGroupId, expectedGroupTag, expectedProviderDeviceId,
  onOutput, prepared, rootId }) {
  const entry = await runInteractiveEntry({ env, formal: { action, attemptId: rootId,
    expectedGroupId, expectedGroupTag, expectedProviderDeviceId }, onOutput, phase: 'formal',
  prepared, rootId });
  const localReceipt = path.join(prepared.capsule.root, `formal-${rootId}-receipt.json`);
  const receipt = await downloadReceipt(prepared.transport, path.win32.join(entry.config.evidenceRoot,
    'formal-receipt.json'), localReceipt, env);
  if (receipt.resultStatus !== 'success' || receipt.formalAttempt.allocated !== true
      || receipt.formalAttempt.started !== true || receipt.rootId !== rootId) {
    throw new Error('formal receipt is invalid');
  }
  return { ...entry, localReceipt, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [controllerCommit, controllerRoot, productObjectRepo, capsuleId] = process.argv.slice(2);
  prepareT152WindowsCapsule({ capsuleId: capsuleId || randomUUID(), controllerCommit,
    controllerRoot, productObjectRepo }).then(({ capsule }) => console.log(
    `[t152-windows-capsule] status=OK local=${capsule.root}`
  )).catch((error) => { console.error(`[t152-windows-capsule] ${error.message}`); process.exitCode = 1; });
}
