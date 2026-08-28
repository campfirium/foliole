#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { createFriPhysicalReadinessAdapter } from '../ios/fri-physical-readiness.mjs';
import {
  TWO_DEVICE_CELLS, validateTwoDeviceCell, validateTwoDeviceMatrix
} from './t152-two-device-matrix-validator.mjs';

const execute = promisify(execFile);

const COMMANDS = Object.freeze({
  'macos-windows': ['scripts/windows/macos-windows-single-principal-sync-group.mjs', '--creator', 'macos'],
  'windows-macos': ['scripts/windows/macos-windows-single-principal-sync-group.mjs', '--creator', 'windows'],
  'macos-a5': ['scripts/android/macos-a5-dev.mjs', 'single-principal-sync-group', '--formal'],
  'windows-a5': ['scripts/android/windows-a5-two-device-sync.mjs'],
  'macos-fri': ['scripts/ios/macos-fri-two-device-sync.mjs'],
  'windows-fri': ['scripts/ios/windows-fri-two-device-sync.mjs']
});

async function git(repoRoot, args) {
  return (await execute('git', args, { cwd: repoRoot })).stdout.trim();
}

export async function freezeTwoDeviceCandidate(repoRoot = process.cwd()) {
  const branch = await git(repoRoot, ['branch', '--show-current']);
  const status = await git(repoRoot, ['status', '--porcelain']);
  const revision = await git(repoRoot, ['rev-parse', 'HEAD']);
  const localDev = await git(repoRoot, ['rev-parse', 'refs/heads/dev']);
  const remoteDev = await git(repoRoot, ['rev-parse', 'refs/remotes/origin/dev']);
  if (branch !== 'dev' || status || revision !== localDev || revision !== remoteDev) {
    throw new Error('T152-12 requires clean pushed dev with HEAD == dev == origin/dev.');
  }
  return { revision, tree: await git(repoRoot, ['rev-parse', 'HEAD^{tree}']) };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

export function allocateTwoDeviceAttempts(root, frozen) {
  const cells = TWO_DEVICE_CELLS.map((cell) => ({ ...cell,
    attemptId: randomUUID(), evidenceRoot: path.join(root, cell.id),
    receiptPath: path.join(root, cell.id, 'cell-receipt.json') }));
  const manifest = { cells, createdAt: new Date().toISOString(),
    resultStatus: 'allocated', schemaVersion: 1, ...frozen };
  writeJson(path.join(root, 'attempts.json'), manifest);
  return manifest;
}

function requireManifest(condition, message) {
  if (!condition) throw new Error(`T152-12 resume rejected: ${message}`);
}

export function readTwoDeviceAttempts(attemptsPath, frozen) {
  const resolved = path.resolve(attemptsPath);
  const root = path.dirname(resolved);
  const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  requireManifest(manifest.schemaVersion === 1 && manifest.resultStatus === 'allocated',
    'attempt manifest is invalid.');
  requireManifest(manifest.revision === frozen.revision && manifest.tree === frozen.tree,
    'candidate revision or tree changed.');
  requireManifest(manifest.cells?.length === TWO_DEVICE_CELLS.length,
    'attempt manifest does not contain six cells.');
  for (const [index, expected] of TWO_DEVICE_CELLS.entries()) {
    const cell = manifest.cells[index];
    requireManifest(cell?.id === expected.id && cell.creator === expected.creator
      && cell.joiner === expected.joiner, 'cell order or roles changed.');
    requireManifest(typeof cell.attemptId === 'string' && cell.attemptId.length > 0,
      `${expected.id} attempt is missing.`);
    requireManifest(path.resolve(cell.evidenceRoot) === path.join(root, expected.id)
      && path.resolve(cell.receiptPath) === path.join(root, expected.id, 'cell-receipt.json'),
    `${expected.id} evidence paths are not bound to this manifest.`);
  }
  requireManifest(new Set(manifest.cells.map(({ attemptId }) => attemptId)).size
    === TWO_DEVICE_CELLS.length, 'attempt identities are not unique.');
  return { manifest, resolved, root };
}

function validateBoundReceipt(receipt, cell, frozen, index) {
  const checked = validateTwoDeviceCell(receipt, TWO_DEVICE_CELLS[index]);
  requireManifest(checked.attemptId === cell.attemptId && checked.revision === frozen.revision
    && checked.tree === frozen.tree, `${cell.id} receipt binding changed.`);
  return checked;
}

function readCompletedPrefix(allocated, frozen) {
  const receipts = [];
  let missing = false;
  for (const [index, cell] of allocated.cells.entries()) {
    if (!fs.existsSync(cell.receiptPath)) { missing = true; continue; }
    requireManifest(!missing, `${cell.id} receipt follows an incomplete cell.`);
    receipts.push(validateBoundReceipt(JSON.parse(fs.readFileSync(cell.receiptPath, 'utf8')),
      cell, frozen, index));
  }
  return receipts;
}

async function waitForFri(root, frozen, receipts, inspectFri) {
  try {
    await inspectFri();
    return null;
  } catch (error) {
    const gatePath = path.join(root, 'fri-wired-gate.json');
    writeJson(gatePath, { attemptsPath: path.join(root, 'attempts.json'),
      checkedAt: new Date().toISOString(), completedCellIds: receipts.map(({ cellId }) => cellId),
      lastSuccessfulAction: error.lastSuccessfulAction ?? null,
      missingFact: error.missingFact ?? 'fri_readiness_failed', resultStatus: 'waiting',
      revision: frozen.revision, schemaVersion: 1, tree: frozen.tree });
    return gatePath;
  }
}

async function defaultRunCell(cell, frozen, repoRoot) {
  const [script, ...baseArgs] = COMMANDS[cell.id];
  const args = [...baseArgs];
  if (['windows-a5', 'macos-fri', 'windows-fri'].includes(cell.id)) {
    args.push(frozen.revision, cell.evidenceRoot);
  }
  await execute(process.execPath, [script, ...args], { cwd: repoRoot, env: { ...process.env,
    FOLIOLE_T152_ACCEPTANCE_ROOT: path.join(cell.evidenceRoot, 'shared'),
    FOLIOLE_T152_CELL_ID: cell.id, FOLIOLE_T152_CELL_RECEIPT: cell.receiptPath,
    FOLIOLE_T152_MATRIX_ATTEMPT: cell.attemptId,
    FOLIOLE_T152_MATRIX_REVISION: frozen.revision, FOLIOLE_T152_MATRIX_TREE: frozen.tree
  }, maxBuffer: 16 * 1024 * 1024, timeout: 2 * 60 * 60_000 });
  if (!fs.existsSync(cell.receiptPath)) {
    throw new Error(`${cell.id} did not produce its bound cell receipt.`);
  }
  return JSON.parse(fs.readFileSync(cell.receiptPath, 'utf8'));
}

export async function runTwoDeviceMatrix({ inspectFri = createFriPhysicalReadinessAdapter(),
  repoRoot = process.cwd(), resumePath = null, runCell = defaultRunCell,
  freezeCandidate = freezeTwoDeviceCandidate } = {}) {
  const frozen = await freezeCandidate(repoRoot);
  const freshRoot = path.join(repoRoot, '.tmp', 'artifacts', 't152-12-two-device',
    frozen.revision, new Date().toISOString().replace(/[-:.TZ]/gu, ''));
  const resumed = resumePath ? readTwoDeviceAttempts(resumePath, frozen) : null;
  const root = resumed?.root ?? freshRoot;
  const allocated = resumed?.manifest ?? allocateTwoDeviceAttempts(root, frozen);
  const receipts = readCompletedPrefix(allocated, frozen);
  const firstMissingIndex = receipts.length;
  for (const [offset, cell] of allocated.cells.slice(firstMissingIndex).entries()) {
    if (cell.id === 'macos-fri') {
      const gatePath = await waitForFri(root, frozen, receipts, inspectFri);
      if (gatePath) return { attemptsPath: path.join(root, 'attempts.json'), gatePath,
        receiptPath: null, root, status: 'waiting-for-fri-wired' };
    }
    const index = firstMissingIndex + offset;
    await runCell(cell, frozen, repoRoot);
    receipts.push(validateBoundReceipt(JSON.parse(fs.readFileSync(cell.receiptPath, 'utf8')),
      cell, frozen, index));
  }
  const checked = validateTwoDeviceMatrix(receipts);
  const receiptPath = path.join(root, 'receipt.json');
  writeJson(receiptPath, { attempts: checked.map(({ attemptId }) => attemptId),
    completedAt: new Date().toISOString(), groups: checked.map(({ groupId, groupTag }) =>
      ({ groupId, groupTag })),
    resultStatus: 'success', revision: frozen.revision, schemaVersion: 1, tree: frozen.tree });
  return { attemptsPath: path.join(root, 'attempts.json'), receiptPath, root, status: 'success' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const resumeIndex = process.argv.indexOf('--resume');
  const resumePath = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : null;
  if (resumeIndex >= 0 && !resumePath) throw new Error('--resume requires an attempts.json path.');
  runTwoDeviceMatrix({ resumePath }).then((result) => {
    const locator = result.receiptPath ?? result.gatePath;
    console.log(`[t152-two-device-matrix] status=${result.status} locator=${locator}`);
  }).catch((error) => {
    console.error(`[t152-two-device-matrix] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
