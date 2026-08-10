#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  acceptanceBoundaryDigest, createAcceptanceManifest
} from './t121-three-device-acceptance-contract.mjs';
import { runAcceptancePhase } from './t121-three-device-acceptance-controller.mjs';
import { buildThreeDeviceJourneyManifest } from './t121-three-device-boundary-builder.mjs';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve({ stderr, stdout })
      : reject(Object.assign(new Error(stderr.trim() || `${command} exited ${code}`), { stderr, stdout })));
  });
}

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

async function frozenCandidate(repoRoot) {
  const [branch, revision, treeDigest, status] = await Promise.all([
    git(repoRoot, ['branch', '--show-current']), git(repoRoot, ['rev-parse', 'HEAD']),
    git(repoRoot, ['rev-parse', 'HEAD^{tree}']), git(repoRoot, ['status', '--porcelain'])
  ]);
  if (branch !== 'dev' || status !== '') throw new Error('T121 candidate must be a clean dev checkout.');
  const verificationPath = path.join(repoRoot, '.tmp/artifacts/t121-candidate-verifications.json');
  const verifications = JSON.parse(fs.readFileSync(verificationPath, 'utf8')).verifications;
  return { branch, clean: true, committed: true, revision, treeDigest, verifications };
}

export function requestDigest(request) {
  return createHash('sha256').update(JSON.stringify({ candidate: request.candidate,
    mutations: request.mutations, schemaVersion: request.schemaVersion })).digest('hex');
}

function rootFor(repoRoot, revision) {
  return path.join(repoRoot, '.tmp/artifacts/t121-three-device-baseline', revision);
}

export async function prepareBaselineAuthorization(repoRoot = process.cwd()) {
  const candidate = await frozenCandidate(repoRoot);
  const request = createBaselineAuthorizationRequest(candidate);
  const root = rootFor(repoRoot, candidate.revision);
  fs.mkdirSync(root, { recursive: true });
  const requestPath = path.join(root, 'authorization-request.json');
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  return { request, requestPath };
}

export function createBaselineAuthorizationRequest(candidate) {
  const request = { candidate, mutations: [
    { device: 'A', effect: 'stop the registered DEV owner; preserve the library; create a new Sync Group through the product' },
    { device: 'B', effect: 'force-stop; protect SQLite, WAL, and attachments; clear app data through the product; join A' },
    { device: 'C', effect: 'stop Windows native runtime; protect the isolated client root; replace only that owned root with an empty product workspace' }
  ], schemaVersion: 1 };
  request.authorizationDigest = requestDigest(request);
  return request;
}

export function assertBaselineAuthorization(request, candidate, authorization) {
  if (authorization !== request.authorizationDigest || requestDigest(request) !== authorization
      || request.candidate.revision !== candidate.revision
      || request.candidate.treeDigest !== candidate.treeDigest) {
    throw new Error('T121 baseline authorization does not match the frozen candidate.');
  }
}

function evidencePath(output, expression, label) {
  const match = expression.exec(output);
  if (!match) throw new Error(`T121 ${label} did not report evidence.`);
  return match[1];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function receipt(step, evidenceRef) {
  return { completedAt: new Date().toISOString(), evidenceRef, resultStatus: 'success', step };
}

async function runNode(repoRoot, script, args = []) {
  return execute(process.execPath, [path.join(repoRoot, script), ...args], { cwd: repoRoot });
}

export async function executeAuthorizedBaseline({ authorization, repoRoot = process.cwd() }) {
  const candidate = await frozenCandidate(repoRoot);
  const root = rootFor(repoRoot, candidate.revision);
  const request = readJson(path.join(root, 'authorization-request.json'));
  assertBaselineAuthorization(request, candidate, authorization);
  const artifacts = {};
  const actions = {
    'freeze-candidate': async () => receipt('freeze-candidate', request.authorizationDigest),
    'protect-original': async () => {
      const macos = await runNode(repoRoot, 'scripts/macos/macos-sync-group-library-protection.mjs',
        ['--label', 'original', '--candidate', candidate.revision]);
      const android = await runNode(repoRoot, 'scripts/android/macos-a5-dev.mjs', ['protect-original']);
      artifacts.originalA = evidencePath(macos.stdout, /evidence=([^\r\n]+)/u, 'macOS protection');
      artifacts.originalB = evidencePath(android.stdout, /protect-original evidence=([^\r\n]+)/u,
        'Android protection');
      return receipt('protect-original', `${artifacts.originalA};${artifacts.originalB}`);
    },
    'reset-c': async () => {
      const result = await runNode(repoRoot, 'scripts/windows/windows-dev-control.mjs',
        ['sync-group-baseline-reset']);
      const identity = evidencePath(result.stdout,
        /sync-group-baseline-reset identity=([A-Za-z0-9.-]+)/u, 'Windows baseline reset');
      artifacts.cReset = path.join(repoRoot, '.tmp/artifacts/sync-group-baseline-reset', identity,
        'sync-group-baseline-reset-manifest.json');
      return receipt('reset-c', artifacts.cReset);
    },
    'rebuild-a-b': async () => {
      await runNode(repoRoot, 'scripts/android/macos-a5-dev.mjs', ['clear-app-data']);
      const paired = await runNode(repoRoot, 'scripts/android/macos-a5-dev.mjs', ['pair-sync']);
      artifacts.rebuild = evidencePath(paired.stdout, /pair-sync evidence=([^\r\n]+)/u,
        'A+B rebuild');
      return receipt('rebuild-a-b', artifacts.rebuild);
    },
    'restart-verify-baseline': async () => {
      const result = await runNode(repoRoot,
        'scripts/android/macos-a5-sync-group-baseline-inspect.mjs');
      artifacts.inspection = evidencePath(result.stdout, /evidence=([^\r\n]+)/u,
        'baseline inspection');
      return receipt('restart-verify-baseline', artifacts.inspection);
    },
    'protect-baseline': async () => {
      const macos = await runNode(repoRoot, 'scripts/macos/macos-sync-group-library-protection.mjs',
        ['--label', 'baseline', '--candidate', candidate.revision]);
      const android = await runNode(repoRoot, 'scripts/android/macos-a5-dev.mjs', ['protect-baseline']);
      artifacts.baselineA = evidencePath(macos.stdout, /evidence=([^\r\n]+)/u,
        'macOS baseline protection');
      artifacts.baselineB = evidencePath(android.stdout, /protect-baseline evidence=([^\r\n]+)/u,
        'Android baseline protection');
      return receipt('protect-baseline', `${artifacts.baselineA};${artifacts.baselineB}`);
    },
    'freeze-journey': async () => {
      const journey = buildThreeDeviceJourneyManifest({
        baselineA: readJson(artifacts.baselineA).protection,
        baselineB: readJson(artifacts.baselineB),
        baselineInspection: readJson(artifacts.inspection).evidence,
        candidate, cReset: readJson(artifacts.cReset),
        originalA: readJson(artifacts.originalA).protection,
        originalB: readJson(artifacts.originalB)
      });
      journey.boundaryDigest = acceptanceBoundaryDigest(journey);
      artifacts.journey = path.join(root, 'journey-manifest.json');
      fs.writeFileSync(artifacts.journey, `${JSON.stringify(journey, null, 2)}\n`, 'utf8');
      return receipt('freeze-journey', artifacts.journey);
    }
  };
  const progress = createAcceptanceManifest({ candidate, phase: 'baseline' });
  await runAcceptancePhase({ actions, manifest: progress,
    manifestPath: path.join(root, 'baseline-progress.json') });
  return { journeyManifestPath: artifacts.journey };
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === 'prepare') return prepareBaselineAuthorization();
  if (argv.length === 3 && argv[0] === 'execute' && argv[1] === '--authorization') {
    return executeAuthorizedBaseline({ authorization: argv[2] });
  }
  throw new Error('usage: t121 baseline <prepare|execute --authorization digest>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await main(process.argv.slice(2));
    console.log(`[t121-baseline] result=${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`[t121-baseline] ${error.message}`);
    process.exitCode = 1;
  }
}
