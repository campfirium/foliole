#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  TWO_DEVICE_CELLS, validateTwoDeviceMatrix
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

export async function runTwoDeviceMatrix({ repoRoot = process.cwd(), runCell = defaultRunCell } = {}) {
  const frozen = await freezeTwoDeviceCandidate(repoRoot);
  const root = path.join(repoRoot, '.tmp', 'artifacts', 't152-12-two-device', frozen.revision,
    new Date().toISOString().replace(/[-:.TZ]/gu, ''));
  const allocated = allocateTwoDeviceAttempts(root, frozen);
  const receipts = [];
  for (const cell of allocated.cells) receipts.push(await runCell(cell, frozen, repoRoot));
  const checked = validateTwoDeviceMatrix(receipts);
  const receiptPath = path.join(root, 'receipt.json');
  writeJson(receiptPath, { attempts: checked.map(({ attemptId }) => attemptId),
    completedAt: new Date().toISOString(), groups: checked.map(({ groupId, groupTag }) =>
      ({ groupId, groupTag })),
    resultStatus: 'success', revision: frozen.revision, schemaVersion: 1, tree: frozen.tree });
  return { receiptPath, root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runTwoDeviceMatrix().then(({ receiptPath }) => {
    console.log(`[t152-two-device-matrix] status=success receipt=${receiptPath}`);
  }).catch((error) => {
    console.error(`[t152-two-device-matrix] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
