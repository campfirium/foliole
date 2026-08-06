#!/usr/bin/env node
/* global console, process */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  evaluateCompanionDatabasePerformanceResults,
  parseCompanionDatabasePerformanceOutput
} from '../mobile/companion-database-performance-contract.mjs';

if (process.platform !== 'darwin') throw new Error('iOS database performance gate requires macOS and Xcode.');

const repoRoot = process.cwd();
const pluginDir = path.join(repoRoot, 'node_modules/@capacitor-community/sqlite');
const testDir = path.join(pluginDir, 'ios/PluginTests');
const fixtureDir = path.join(repoRoot, 'scripts/sync/fixtures');
const artifactDir = path.join(repoRoot, '.tmp/artifacts/companion-database-performance');
mkdirSync(testDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });
for (const name of ['FolioleDatabasePerformanceSupport.swift', 'FolioleDatabasePerformanceGateTests.swift']) {
  copyFileSync(path.join(fixtureDir, name), path.join(testDir, name));
}

const workspace = path.join(pluginDir, '.swiftpm/xcode/package.xcworkspace');
mkdirSync(workspace, { recursive: true });
writeFileSync(path.join(workspace, 'contents.xcworkspacedata'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Workspace version="1.0"><FileRef location="self:"></FileRef></Workspace>', ''
].join('\n'));

const destination = simulatorDestination();
const result = spawnSync('xcodebuild', [
  'test', '-workspace', workspace, '-scheme', 'CapacitorCommunitySqlite',
  '-destination', destination,
  '-only-testing:CapacitorSQLitePluginTests/FolioleDatabasePerformanceGateTests/testFrozenMobileDatabasePerformanceGate'
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const outputPath = path.join(artifactDir, 'ios-performance.log');
writeFileSync(outputPath, output);
const measurements = parseCompanionDatabasePerformanceOutput(output);
const gate = evaluateCompanionDatabasePerformanceResults(measurements, ['ios']);
const evidencePath = path.join(artifactDir, 'ios-performance.json');
writeFileSync(evidencePath, `${JSON.stringify({ gate, measurements, platform: 'ios', rawOutputPath: outputPath, schemaVersion: 1 }, null, 2)}\n`);
process.stdout.write(output);
console.log(`[ios-database-performance] evidence=${evidencePath}`);
if (result.status !== 0) process.exitCode = result.status ?? 1;
else if (!gate.passed) {
  console.error(`[ios-database-performance] gate failed: ${gate.failures.join('; ')}`);
  process.exitCode = 1;
}

function simulatorDestination() {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Could not list iOS simulators.');
  for (const [runtime, devices] of Object.entries(JSON.parse(result.stdout).devices ?? {})) {
    if (!runtime.includes('iOS')) continue;
    const device = devices.find((entry) => entry.isAvailable && /^iPhone /u.test(entry.name));
    if (device) return `platform=iOS Simulator,id=${device.udid}`;
  }
  throw new Error('Could not find an available iPhone simulator.');
}
