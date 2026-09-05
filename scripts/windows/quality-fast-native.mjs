/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { runCappedHeavyPlan, splitRelatedTests } from '../quality/quality-fast-capped.mjs';
import {
  runNativeLightMidPlan,
  runNativeT0StaticGuards
} from './quality-fast-native-local-steps.mjs';
import { resolveChangedFiles, runCapture } from './windows-preview-native-runtime.mjs';
import { WINDOWS_NATIVE_REPO_ROOT } from './windows-native-paths.mjs';

const HEAVY_LEVELS = new Set(['android', 'desktop', 'full', 'ios', 'shared']);
const SECTION_PREFIX = /^\[quality-gate-route\]\s{3}/u;

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

export function parseQualityFastNativeArgs(args) {
  if (args.length === 0) return 'run';
  if (args.length === 1 && args[0] === '--route') return 'route';
  if (args.length === 1 && args[0] === '--route-json') return 'route-json';
  throw new Error('quality:fast accepts only --route or --route-json; aggregate quality is hosted-only');
}

function printRoutePlan(plan) {
  console.log(`[quality-gate-route] selected level: ${plan.level}`);
  console.log(`[quality-gate-route] target: ${plan.target}`);
  for (const [label, values] of [
    ['changed files', plan.changedFiles],
    ['lint targets', plan.lintTargets],
    ['related tests', plan.relatedTests]
  ]) {
    console.log(`[quality-gate-route] ${label}: ${values.length === 0 ? 'none' : ''}`.trimEnd());
    for (const value of values) console.log(`[quality-gate-route]   ${value}`);
  }
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
  const result = await runCapture(bashExe, ['scripts/quality/quality-gate-fast.sh', '--route-json'], {
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

export async function runQualityT0Native(options = {}) {
  const env = options.env ?? process.env;
  const bashExe = options.bashExe ?? resolveGitBash(env);
  const changedFileResolver = options.resolveChangedFiles ?? resolveChangedFiles;
  const changedFiles = options.changedFiles ?? parseEnvFileList(env.QUALITY_GATE_CHANGED_FILES);
  const resolvedChangedFiles = changedFiles.length > 0
    ? changedFiles
    : await changedFileResolver(WINDOWS_NATIVE_REPO_ROOT, ['.'], { includeDeletes: true });
  const plan = options.plan ?? (await resolveRoutePlan(bashExe, resolvedChangedFiles, env));
  const runner = options.runner ?? runInherited;
  const routeEnv = { ...env, QUALITY_GATE_CHANGED_FILES: toEnvFileList(resolvedChangedFiles) };

  if (options.planOnly) return plan;

  console.log(`[quality-fast-native] selected level: ${plan.level || '(unknown)'}`);
  await runNativeT0StaticGuards(routeEnv, runner, runStep);
  if (!HEAVY_LEVELS.has(plan.level)) {
    await runNativeLightMidPlan(plan, {
      env: routeEnv,
      runner,
      runStep,
      splitRelatedTests
    });
    return plan;
  }

  await runCappedHeavyPlan(plan, {
    cacheLocation: '.tmp/eslint-cache/quality-fast-native/', env: routeEnv, runStep, runner
  });
  console.log(
    `[quality-fast-native] ${plan.level}-class change detected -> hosted quality deferred to scheduled T7 Hosted Quality; ` +
    'Remote Quality is reserved for repair or explicit rechecks on dev, while releases use T7 Release.'
  );
  return plan;
}

async function main() {
  try {
    const mode = parseQualityFastNativeArgs(process.argv.slice(2));
    const plan = await runQualityT0Native({ planOnly: mode !== 'run' });
    if (mode === 'route-json') {
      process.stdout.write(`${JSON.stringify(plan)}\n`);
      return;
    }
    if (mode === 'route') {
      printRoutePlan(plan);
      return;
    }
    console.log('[quality-fast-native] all checks passed.');
  } catch (error) {
    console.error(`[quality-fast-native] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/windows/quality-fast-native.mjs')) {
  await main();
}
