#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { runWindowsDevBuild } from './windows-dev-build.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';
import { syncGroupResultManifestPath } from './windows-sync-group-build-routing.mjs';
import { writeWindowsSyncGroupProviderRelease } from
  './windows-sync-group-provider-release-control.mjs';
import { readJson, syncGroupInteractivePaths } from './windows-sync-group-interactive-state.mjs';
import {
  assertT173RouteIdentity, assertT173RuntimeIdentity, measureT173RuntimeIdentity,
  t173PreparedBuildPaths, T173_WINDOWS_ACTIONS, T173_WINDOWS_REPO_ROOT,
  T173_WINDOWS_SOURCE_REF
} from './t173-windows-candidate-contract.mjs';

const RELEASES = Object.freeze({
  'multi-device-sync-provider-cancel': 'cancelled',
  'multi-device-sync-provider-complete': 'consumer_complete'
});

function parse(argv) {
  if (argv.length !== 4) throw new Error('T173 Windows candidate action arguments are invalid.');
  const [action, revision, treeDigest, routeIdentity] = argv;
  if (action !== 'prepare' && !T173_WINDOWS_ACTIONS.has(action) && !RELEASES[action]) {
    throw new Error('T173 Windows candidate action is invalid.');
  }
  return { action, expected: { branch: 'sync', clean: true, committed: true, revision,
    sourceRef: T173_WINDOWS_SOURCE_REF, sourceRoot: T173_WINDOWS_REPO_ROOT, treeDigest },
  routeIdentity };
}

function digest(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertPreparedBuild(build, repoRoot) {
  const { electron, main } = t173PreparedBuildPaths(repoRoot);
  if (build?.electronPath !== electron || build.mainPath !== main
      || build.electronSha256 !== digest(electron) || build.mainSha256 !== digest(main)) {
    throw new Error('T173 Windows prepared runtime/build identity mismatch.');
  }
  return build;
}

function receiptPaths(repoRoot, routeIdentity) {
  const root = path.join(repoRoot, '.tmp', 'artifacts', 't173-windows-candidate', routeIdentity);
  return { receipt: path.join(root, 'receipt.json'), root };
}

function writeReceipt(paths, value) {
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(paths.receipt, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function checked(command, args, options) {
  const result = await executeBounded(command, args, options);
  if (result.code !== 0) throw new Error(result.lines?.at(-1) || `${command} exited ${result.code}`);
  return result;
}

async function prepare(paths, identity) {
  for (const script of ['build', 'electron:compile']) {
    await checked(paths.systemNode, [paths.systemNpmCli, 'run', script], {
      cwd: paths.repoRoot, timeoutCode: `t173_${script.replace(':', '_')}_timeout`,
      timeoutMs: 20 * 60_000, windowsHide: true
    });
  }
  const { electron, main } = t173PreparedBuildPaths(paths.repoRoot);
  return { build: { electronPath: electron, electronSha256: digest(electron),
    mainPath: main, mainSha256: digest(main) }, runtimeIdentity: identity };
}

function preparedReceipt(repoRoot, revision) {
  const pointer = path.join(repoRoot, '.tmp', 'artifacts', 't173-windows-candidate',
    `prepared-${revision}.json`);
  const receipt = readJson(pointer);
  if (receipt?.resultStatus !== 'success') throw new Error('T173 Windows candidate is not prepared.');
  return { pointer, receipt };
}

export async function runT173WindowsCandidateAction(config, {
  inspect = measureT173RuntimeIdentity, runAction = runWindowsDevBuild
} = {}) {
  const paths = windowsDevPaths({ repoRoot: T173_WINDOWS_REPO_ROOT });
  assertT173RouteIdentity(config.routeIdentity, config.expected.revision);
  const before = assertT173RuntimeIdentity(config.expected,
    inspect({ gitPath: paths.gitPath, repoRoot: paths.repoRoot }));
  const output = receiptPaths(paths.repoRoot, config.routeIdentity);
  if (RELEASES[config.action]) {
    const release = writeWindowsSyncGroupProviderRelease({
      repoRoot: paths.repoRoot, status: RELEASES[config.action]
    });
    return { release, resultStatus: 'success', runtimeIdentity: before };
  }
  if (config.action === 'prepare') {
    const result = await prepare(paths, before);
    const receipt = { action: config.action, completedAt: new Date().toISOString(), ...result,
      resultStatus: 'success', routeIdentity: config.routeIdentity, schemaVersion: 1 };
    writeReceipt(output, receipt);
    const pointer = path.join(paths.repoRoot, '.tmp', 'artifacts', 't173-windows-candidate',
      `prepared-${config.expected.revision}.json`);
    fs.copyFileSync(output.receipt, pointer);
    return { receipt, receiptPath: output.receipt };
  }
  const prepared = preparedReceipt(paths.repoRoot, config.expected.revision).receipt;
  assertT173RuntimeIdentity(config.expected, prepared.runtimeIdentity);
  assertPreparedBuild(prepared.build, paths.repoRoot);
  const action = await runAction({ acceptanceCandidate: config.expected, action: config.action,
    paths, platform: 'win32' });
  if (action.exitCode !== 0) throw new Error(action.summary.message || 'T173 Windows action failed.');
  const interactive = readJson(syncGroupInteractivePaths(paths.repoRoot).result);
  assertT173RuntimeIdentity(config.expected, interactive?.candidateRuntimeIdentity);
  const after = assertT173RuntimeIdentity(config.expected,
    inspect({ gitPath: paths.gitPath, repoRoot: paths.repoRoot }));
  assertPreparedBuild(prepared.build, paths.repoRoot);
  const actionReceiptPath = syncGroupResultManifestPath(action.summary, config.action);
  if (!actionReceiptPath || !fs.existsSync(actionReceiptPath)) {
    throw new Error('T173 Windows product action receipt is missing.');
  }
  const receipt = { action: config.action, actionReceiptPath,
    build: prepared.build, completedAt: new Date().toISOString(), resultStatus: 'success',
    routeIdentity: config.routeIdentity, runtimeIdentity: after, schemaVersion: 1,
    workerRuntimeIdentity: interactive.candidateRuntimeIdentity };
  writeReceipt(output, receipt);
  return { receipt, receiptPath: output.receipt };
}

async function main() {
  const config = parse(process.argv.slice(2));
  const result = await runT173WindowsCandidateAction(config);
  if (result.receiptPath) {
    process.stdout.write(`[t173-windows-candidate] action=${config.action} `
      + `identity=${config.routeIdentity} manifest=${result.receiptPath}\n`);
  } else {
    process.stdout.write(`[t173-windows-candidate] action=${config.action} status=success\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`[t173-windows-candidate] ${error.message}\n`);
    process.exitCode = 1;
  });
}
