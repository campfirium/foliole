#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveWindowsNativePaths, WINDOWS_NATIVE_REPO_ROOT } from './windows-native-paths.mjs';

const DEFAULT_WORKDIR = process.platform === 'win32' ? WINDOWS_NATIVE_REPO_ROOT : 'D:\\C\\foliole';
const FORBIDDEN_PREFIXES = ['D:\\X\\', 'C:\\Users\\'];
const DEFAULT_GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Users\\zephu\\scoop\\apps\\git\\current\\bin\\bash.exe'
];

export function normalizeWindowsPath(value) {
  return String(value || '')
    .trim()
    .replaceAll('/', '\\')
    .replace(/\\+$/u, '');
}

function hasDriveRoot(value) {
  return /^[A-Za-z]:\\/u.test(value);
}

function hasWhitespace(value) {
  return /\s/u.test(value);
}

export function isWslBashPath(value) {
  const normalized = normalizeWindowsPath(value).toLowerCase();
  return normalized === 'c:\\windows\\system32\\bash.exe';
}

export function isForbiddenWorkdir(value) {
  const normalized = `${normalizeWindowsPath(value)}\\`.toUpperCase();
  return FORBIDDEN_PREFIXES.some((prefix) => normalized.startsWith(prefix.toUpperCase()));
}

export function findGitBashPath(candidates = DEFAULT_GIT_BASH_CANDIDATES) {
  return candidates.map(normalizeWindowsPath).find((candidate) => candidate && fs.existsSync(candidate)) ?? '';
}

export function resolvePilotPreflight(env = process.env, options = {}) {
  const workdir = normalizeWindowsPath(env.FOLIOLE_WINDOWS_NATIVE_WORKDIR || env.WINDOWS_NATIVE_WORKDIR || DEFAULT_WORKDIR);
  const configuredGitBashPath = normalizeWindowsPath(env.FOLIOLE_WINDOWS_GIT_BASH || env.npm_config_script_shell || '');
  const gitBashPath = configuredGitBashPath || findGitBashPath(options.gitBashCandidates);
  const nativePaths = resolveWindowsNativePaths(workdir);
  const errors = [];
  const warnings = [];

  if (!hasDriveRoot(workdir)) {
    errors.push(`workdir must be an absolute Windows drive path: ${workdir || '(empty)'}`);
  }
  if (hasWhitespace(workdir)) {
    errors.push(`workdir must not contain whitespace for the first pilot: ${workdir}`);
  }
  if (isForbiddenWorkdir(workdir)) {
    errors.push(`workdir must not be under a protected user/data root: ${workdir}`);
  }
  if (isWslBashPath(gitBashPath)) {
    errors.push(`bash path resolves to WSL bash; use Git Bash explicitly: ${gitBashPath}`);
  }
  if (!gitBashPath) {
    warnings.push('Git Bash path was not provided; Windows npm scripts that call bash must verify it before migration.');
  } else if (!configuredGitBashPath) {
    warnings.push(`Git Bash path was auto-detected; set FOLIOLE_WINDOWS_GIT_BASH if this changes: ${gitBashPath}`);
  }

  return {
    config: {
      bridgeReadyFile: nativePaths.bridgeReadyFile,
      electronUserDataDir: nativePaths.userDataPath,
      gitBashPath,
      homeDir: `${workdir}\\.home`,
      logDir: nativePaths.logDir,
      npmCacheDir: `${workdir}\\.npm-cache`,
      readyFile: nativePaths.appReadyFile,
      tempDir: `${workdir}\\.tmp`,
      workdir
    },
    errors,
    ok: errors.length === 0,
    warnings
  };
}

function printResult(result) {
  console.log(`[windows-native-preflight] workdir=${result.config.workdir}`);
  console.log(`[windows-native-preflight] home=${result.config.homeDir}`);
  console.log(`[windows-native-preflight] npm-cache=${result.config.npmCacheDir}`);
  console.log(`[windows-native-preflight] electron-user-data=${result.config.electronUserDataDir}`);
  console.log(`[windows-native-preflight] ready-marker=${result.config.readyFile}`);
  console.log(`[windows-native-preflight] bridge-marker=${result.config.bridgeReadyFile}`);
  console.log(`[windows-native-preflight] log-dir=${result.config.logDir}`);
  if (result.config.gitBashPath) {
    console.log(`[windows-native-preflight] git-bash=${result.config.gitBashPath}`);
  }
  for (const warning of result.warnings) {
    console.log(`[windows-native-preflight] warning: ${warning}`);
  }
  for (const error of result.errors) {
    console.error(`[windows-native-preflight] error: ${error}`);
  }
  console.log(`[windows-native-preflight] status: ${result.ok ? 'OK' : 'FAILED'}`);
}

function main() {
  const result = resolvePilotPreflight();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
