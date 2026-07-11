#!/usr/bin/env node
/* global console, process */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PREVIEW_TARGET_PATHS } from './path-domain-preview-paths.mjs';

const DEPENDENCY_ROOT_PATTERN = /^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/u;
const TEST_FILE_PATTERN = /\.(test|spec)\.[^.]+$/u;
const LINTABLE_FILE_PATTERN = /\.(js|jsx|ts|tsx|cjs|mjs)$/u;
const SYNC_PACK_PATH_PATTERN = /^(lib\/core\/sync\/syncPack|electron\/database\/syncPack|electron\/sync\/syncPack|src\/shared\/platform\/companionSyncPack)/u;
const ANDROID_CONTRACT_PATH_PATTERN = /^lib\/core\/database\/androidCompanion.*\.ts$/u;
const ANDROID_SYNC_BOUNDARY_PATH_PATTERN =
  /^(lib\/core\/database\/androidCompanion.*\.ts|android\/app\/src\/main\/assets\/companion-.*\.json|android\/app\/src\/main\/java\/com\/foliole\/android\/FolioleCompanionSync.*\.java)/u;

export { PREVIEW_TARGET_PATHS };

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').trim();
}

function splitInput(input) {
  return input.split(/\r?\n/u).map(normalizePath).filter(Boolean);
}

export function isSyncPackPath(filePath) {
  return SYNC_PACK_PATH_PATTERN.test(normalizePath(filePath));
}

export function isAndroidContractPath(filePath) {
  return ANDROID_CONTRACT_PATH_PATTERN.test(normalizePath(filePath));
}

export function isAndroidSyncBoundaryPath(filePath) {
  return ANDROID_SYNC_BOUNDARY_PATH_PATTERN.test(normalizePath(filePath));
}

export function resolveStaticQualityRoute(files) {
  const changed = files.map(normalizePath).filter(Boolean);
  if (changed.length === 0) {
    return { level: 'light', reason: 'no changed files detected' };
  }
  if (!changed.some((filePath) => !TEST_FILE_PATTERN.test(filePath))) {
    return { level: 'mid', reason: 'test files changed' };
  }
  if (changed.some((filePath) => DEPENDENCY_ROOT_PATTERN.test(filePath))) {
    return { level: 'full', reason: 'dependency root changed' };
  }
  if (changed.some(isAndroidContractPath)) {
    const hasOtherProductionPath = changed.some((filePath) => !isAndroidContractPath(filePath) && !TEST_FILE_PATTERN.test(filePath));
    return hasOtherProductionPath
      ? { level: 'full', reason: 'Android contract changed with another production domain' }
      : { level: 'android', reason: 'Android contract changed' };
  }
  if (changed.some((filePath) => filePath.startsWith('electron/'))) {
    return { level: 'desktop', reason: 'desktop runtime changed' };
  }
  if (changed.some((filePath) => filePath.startsWith('lib/') || filePath.startsWith('src/store/') || filePath.startsWith('src/shared/platform/'))) {
    return { level: 'shared', reason: 'shared runtime or store changed' };
  }
  if (changed.some((filePath) => filePath.startsWith('scripts/') && !filePath.startsWith('scripts/android/'))) {
    return { level: 'mid', reason: 'non-Android script changed' };
  }
  if (changed.some(isAndroidSurfacePath)) {
    return { level: 'android', reason: 'android or companion path changed' };
  }
  if (changed.some((filePath) => filePath.startsWith('src/shared/ui/') && !TEST_FILE_PATTERN.test(filePath))) {
    return { level: 'mid', reason: 'shared UI surface changed' };
  }
  return null;
}

export function inferPreviewTargetsFromPath(filePath) {
  const normalized = normalizePath(filePath);
  const targets = [];
  for (const target of ['android', 'windows']) {
    if (PREVIEW_TARGET_PATHS[target].some((prefix) => normalized === prefix || normalized.startsWith(prefix))) {
      targets.push(target);
    }
  }
  return targets;
}

export function inferPreviewTargetsFromFiles(files) {
  const targets = new Set();
  for (const filePath of files) {
    for (const target of inferPreviewTargetsFromPath(filePath)) {
      targets.add(target);
    }
  }
  return ['android', 'windows'].filter((target) => targets.has(target));
}

export function pathMatchesLintScope(scope, filePath) {
  const normalized = normalizePath(filePath);
  if (!LINTABLE_FILE_PATTERN.test(normalized)) {
    return false;
  }
  switch (scope) {
    case '':
      return true;
    case 'desktop':
      return matchesAny(normalized, [
        'src/app/',
        'src/features/',
        'src/shared/ui/',
        'src/shared/platform/',
        'electron/',
        'scripts/windows/',
        'vite.config.ts',
        'playwright.desktop.config.ts'
      ]);
    case 'android':
      return matchesAny(normalized, [
        'src/companion/',
        'src/shared/platform/',
        'src/shared/ui/',
        'src/shared/lib/',
        'src/shared/commands/',
        'src/shared/config/',
        'scripts/android/',
        'android/',
        'capacitor.config.ts',
        'vite.companion.config.ts'
      ]);
    case 'shared':
      return matchesSharedLintScope(normalized);
    default:
      throw new Error(`unknown scope: ${scope}`);
  }
}

function matchesSharedLintScope(filePath) {
  return matchesAny(filePath, [
    'src/shared/',
    'src/features/',
    'src/store/',
    'scripts/check-',
    'scripts/layer-',
    'scripts/lint-changed',
    'scripts/quality-',
    'scripts/quality/',
    'scripts/vite-config',
    'vite.config.ts',
    'vite.companion.config.ts',
    'playwright.desktop.config.ts',
    'capacitor.config.ts'
  ]);
}

function isAndroidSurfacePath(filePath) {
  return (
    filePath.startsWith('android/') ||
    filePath.startsWith('scripts/android/') ||
    filePath.startsWith('src/companion/') ||
    filePath === 'capacitor.config.ts' ||
    filePath === 'vite.companion.config.ts'
  );
}

function matchesAny(filePath, prefixes) {
  return prefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

function printQualityRoute(files) {
  const route = resolveStaticQualityRoute(files);
  if (route) {
    console.log(`${route.level}\t${route.reason}`);
  }
}

function printLintScope(scope, files) {
  for (const filePath of files) {
    if (pathMatchesLintScope(scope, filePath)) {
      console.log(filePath);
    }
  }
}

function printPreviewTargetPaths(target) {
  for (const filePath of PREVIEW_TARGET_PATHS[target] ?? []) {
    console.log(filePath);
  }
}

function main() {
  const [command, arg] = process.argv.slice(2);
  const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  const files = splitInput(input);
  if (command === 'quality-route') {
    printQualityRoute(files);
    return 0;
  }
  if (command === 'lint-scope') {
    try {
      printLintScope(arg ?? '', files);
      return 0;
    } catch (error) {
      console.error(`[path-domains] ${error.message}`);
      return 1;
    }
  }
  if (command === 'preview-target-paths') {
    printPreviewTargetPaths(arg);
    return 0;
  }
  console.error('Usage: node scripts/lib/path-domains.mjs <quality-route|lint-scope|preview-target-paths> [arg]');
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main();
}
