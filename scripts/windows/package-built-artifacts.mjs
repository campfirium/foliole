#!/usr/bin/env node
/* global console, process */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_BUILT_ARTIFACTS = [
  'dist/desktop/index.html',
  'dist/electron/main.js'
];

const REQUIRED_PACKAGE_INPUTS = [
  'electron/preload.cjs'
];

const BUILD_INPUTS = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'electron/tsconfig.json',
  'src',
  'electron'
];

const IGNORED_DIRS = new Set(['dist', 'node_modules', 'release', 'artifacts', '.git', '.tmp']);

function collectLatestMtimeMs(entryPath) {
  if (!existsSync(entryPath)) {
    return 0;
  }
  const stats = statSync(entryPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }
  return readdirSync(entryPath, { withFileTypes: true }).reduce((latest, entry) => {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      return latest;
    }
    return Math.max(latest, collectLatestMtimeMs(resolve(entryPath, entry.name)));
  }, stats.mtimeMs);
}

export function collectBuiltArtifactState(rootDir = process.cwd()) {
  const artifacts = REQUIRED_BUILT_ARTIFACTS.map((artifact) => resolve(rootDir, artifact));
  const packageInputs = REQUIRED_PACKAGE_INPUTS.map((artifact) => resolve(rootDir, artifact));
  const missing = [...artifacts, ...packageInputs].filter((artifactPath) => !existsSync(artifactPath));
  const oldestArtifactMtimeMs = missing.length > 0
    ? 0
    : Math.min(...artifacts.map((artifactPath) => statSync(artifactPath).mtimeMs));
  const newestInputMtimeMs = Math.max(...BUILD_INPUTS.map((input) => collectLatestMtimeMs(resolve(rootDir, input))));

  return {
    missing,
    newestInputMtimeMs,
    oldestArtifactMtimeMs
  };
}

export function assertBuiltArtifactsFresh(rootDir = process.cwd()) {
  const state = collectBuiltArtifactState(rootDir);
  if (state.missing.length > 0) {
    throw new Error(`Missing built artifacts: ${state.missing.join(', ')}`);
  }
  if (state.oldestArtifactMtimeMs < state.newestInputMtimeMs) {
    throw new Error('Built artifacts are older than source inputs. Run npm run quality:release:core first.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('package-built-artifacts.mjs')) {
  try {
    assertBuiltArtifactsFresh();
  } catch (error) {
    console.error(`[windows-package] ${error.message}`);
    process.exitCode = 1;
  }
}
