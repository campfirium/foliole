/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { controlledElectronSqliteTests } from '../native-sqlite-test-policy.mjs';
import { runNativeLightMidPlan } from './quality-fast-native-local-steps.mjs';
import { npmRunCommand, resolveChangedFiles, runCapture } from './windows-preview-native-runtime.mjs';
import { WINDOWS_NATIVE_REPO_ROOT } from './windows-native-paths.mjs';

const HEAVY_LEVELS = new Set(['android', 'desktop', 'full', 'shared']);
const SECTION_PREFIX = /^\[quality-gate-route\]\s{3}/u;
const ELECTRON_SQLITE_TESTS = new Set(controlledElectronSqliteTests);

export function isRejectedBashPath(filePath) {
  const normalized = filePath.replaceAll('/', '\\').toLowerCase();
  return normalized.endsWith('\\windows\\system32\\bash.exe') || normalized.endsWith('\\wsl.exe');
}

function candidateExists(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath) && !isRejectedBashPath(filePath);
}

export function resolveGitBash(env = process.env) {
  const explicit = env.FOLIOLE_GIT_BASH;
  if (candidateExists(explicit)) {
    return explicit;
  }

  const candidates = [
    env.ProgramFiles ? path.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe') : '',
    env['ProgramFiles(x86)'] ? path.join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe') : '',
    env.USERPROFILE ? path.join(env.USERPROFILE, 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe') : '',
    env.USERPROFILE ? path.join(env.USERPROFILE, 'scoop', 'shims', 'bash.exe') : ''
  ];
  const resolved = candidates.find(candidateExists);
  if (!resolved) {
    throw new Error('Git Bash not found. Set FOLIOLE_GIT_BASH to Git for Windows bash.exe.');
  }
  return resolved;
}

export function parseRoutePlan(output) {
  const lines = output.split(/\r?\n/u);
  const plan = { changedFiles: [], level: '', lintTargets: [], relatedTests: [], target: '' };
  let section = '';
  for (const line of lines) {
    if (line.startsWith('[quality-gate-route] selected level:')) {
      plan.level = line.split(':').slice(1).join(':').trim();
      section = '';
      continue;
    }
    if (line.startsWith('[quality-gate-route] target:')) {
      plan.target = line.split(':').slice(1).join(':').trim();
      section = '';
      continue;
    }
    if (line === '[quality-gate-route] changed files:') {
      section = 'changedFiles';
      continue;
    }
    if (line === '[quality-gate-route] lint targets:') {
      section = 'lintTargets';
      continue;
    }
    if (line === '[quality-gate-route] related tests:') {
      section = 'relatedTests';
      continue;
    }
    if (SECTION_PREFIX.test(line) && section) {
      plan[section].push(line.replace(SECTION_PREFIX, '').trim());
      continue;
    }
    section = '';
  }
  for (const key of ['changedFiles', 'lintTargets', 'relatedTests']) {
    plan[key] = plan[key].filter((item) => item && item !== 'none');
  }
  return plan;
}

function toEnvFileList(files) {
  return files.filter(Boolean).join('\n');
}

function parseEnvFileList(value) {
  if (!value) {
    return [];
  }
  return value
    .split(/\r?\n|,/u)
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

async function runInherited(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? WINDOWS_NATIVE_REPO_ROOT,
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit'
    });
    child.on('error', (error) => {
      console.error(`[quality-fast-native] failed to start ${options.label ?? command}: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function runStep(label, command, args, env = process.env, runner = runInherited) {
  console.log(`[quality-fast-native] running: ${label}`);
  const code = await runner(command, args, { env, label });
  if (code !== 0) {
    throw new Error(`${label} failed`);
  }
}

async function resolveRoutePlan(bashExe, changedFiles, env = process.env) {
  const routeEnv = { ...env, QUALITY_GATE_CHANGED_FILES: toEnvFileList(changedFiles) };
  const result = await runCapture(bashExe, ['scripts/quality-gate-fast.sh', '--route-json'], {
    cwd: WINDOWS_NATIVE_REPO_ROOT,
    env: routeEnv
  });
  if (result.code !== 0) {
    throw new Error(`quality route failed\n${result.stdout}\n${result.stderr}`.trim());
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`quality route JSON parse failed: ${error.message}\n${result.stdout}`.trim());
  }
}

function normalizeRepoPath(file) {
  return file.replaceAll('\\', '/');
}

function isElectronAbiTest(file) {
  const normalized = normalizeRepoPath(file);
  return normalized.startsWith('electron/') || ELECTRON_SQLITE_TESTS.has(normalized);
}

function splitRelatedTests(tests) {
  const electron = [];
  const ordinary = [];
  for (const file of tests) {
    if (isElectronAbiTest(file)) {
      electron.push(file);
    } else {
      ordinary.push(file);
    }
  }
  return { electron, ordinary };
}

function resolveCappedTypecheckScripts(level) {
  if (level === 'shared') {
    return ['typecheck:shared'];
  }
  if (level === 'android') {
    return ['typecheck:android'];
  }
  if (level === 'full') {
    return ['typecheck:desktop', 'typecheck:shared', 'typecheck:android'];
  }
  return ['typecheck:desktop'];
}

async function runCappedHeavyPlan(plan, env = process.env, runner = runInherited) {
  if (plan.lintTargets.length > 0) {
    await runStep('scoped lint', process.execPath, [
      'node_modules/eslint/bin/eslint.js',
      '--cache',
      '--cache-location',
      '.tmp/eslint-cache/quality-fast-native/',
      ...plan.lintTargets
    ], env, runner);
  } else {
    console.log('[quality-fast-native] no lintable changed files detected - skipping scoped lint');
  }

  for (const script of resolveCappedTypecheckScripts(plan.level)) {
    const typecheck = npmRunCommand(script);
    await runStep(script, typecheck.command, typecheck.args, env, runner);
  }

  const related = splitRelatedTests(plan.relatedTests);
  if (related.ordinary.length > 0) {
    await runStep('related tests', process.execPath, ['scripts/test-files.mjs', ...related.ordinary], env, runner);
  }
  if (related.electron.length > 0) {
    await runStep('electron related tests', process.execPath, [
      'scripts/electron-sqlite-runner.mjs',
      'scripts/test-files.mjs',
      ...related.electron
    ], env, runner);
  }
  if (plan.relatedTests.length === 0) {
    console.log('[quality-fast-native] no related test files detected - skipping tests');
  }
}

export async function runQualityT0Native(options = {}) {
  const env = options.env ?? process.env;
  const bashExe = options.bashExe ?? resolveGitBash(env);
  const changedFiles = options.changedFiles ?? parseEnvFileList(env.QUALITY_GATE_CHANGED_FILES);
  const resolvedChangedFiles = changedFiles.length > 0 ? changedFiles : await resolveChangedFiles(WINDOWS_NATIVE_REPO_ROOT);
  const plan = options.plan ?? (await resolveRoutePlan(bashExe, resolvedChangedFiles, env));
  const runner = options.runner ?? runInherited;

  console.log(`[quality-fast-native] selected level: ${plan.level || '(unknown)'}`);
  if (!HEAVY_LEVELS.has(plan.level)) {
    await runNativeLightMidPlan(plan, {
      env: { ...env, QUALITY_GATE_CHANGED_FILES: toEnvFileList(resolvedChangedFiles) },
      runner,
      runStep,
      splitRelatedTests
    });
    return plan;
  }

  await runCappedHeavyPlan(plan, env, runner);
  const deferred = plan.level === 'full' ? 'quality:full' : `quality:${plan.level}`;
  console.log(`[quality-fast-native] ${plan.level}-class change detected -> T0 follow-up gate deferred: npm run ${deferred}`);
  return plan;
}

async function main() {
  try {
    await runQualityT0Native();
    console.log('[quality-fast-native] all checks passed.');
  } catch (error) {
    console.error(`[quality-fast-native] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/windows/quality-fast-native.mjs')) {
  await main();
}
