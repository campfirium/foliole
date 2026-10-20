#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prepareIosAcceptanceCache, resolveIosAcceptanceCache } from './ios-local-storage.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Mirrors the public minimal iOS flow in ios/AGENTS.md: a complete unsigned app
// compile that never launches a simulator or reuses its products for acceptance.
export function createUnsignedAppCompileSteps(repoRoot) {
  const { derivedData } = resolveIosAcceptanceCache(repoRoot);
  return [
    ['npm', ['run', 'android:web:build']],
    ['npx', ['cap', 'sync', 'ios']],
    ['xcodebuild', [
      '-project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '-scheme', 'App',
      '-configuration', 'Debug', '-destination', 'generic/platform=iOS Simulator',
      '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO', 'build'
    ]]
  ];
}

export function runUnsignedAppCompile(repoRoot = REPO_ROOT, run = spawnSync) {
  prepareIosAcceptanceCache(repoRoot);
  for (const [command, args] of createUnsignedAppCompileSteps(repoRoot)) {
    const result = run(command, args, { cwd: repoRoot, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status ?? 'signal'}`);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    runUnsignedAppCompile();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
