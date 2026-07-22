/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { controlledElectronSqliteTests } from '../native-sqlite-test-policy.mjs';

const ELECTRON_SQLITE_TESTS = new Set(controlledElectronSqliteTests);

export function resolveNpmRunCommand(
  script, env = process.env, platform = process.platform, nodePath = process.execPath
) {
  const npmExecPath = env.npm_execpath?.trim();
  if (!npmExecPath) throw new Error(`npm_execpath is required for capped quality on ${platform}`);
  return { command: nodePath, args: [npmExecPath, 'run', script] };
}

function isElectronAbiTest(file) {
  const normalized = file.replaceAll('\\', '/');
  return normalized.startsWith('electron/') || ELECTRON_SQLITE_TESTS.has(normalized);
}

export function splitRelatedTests(tests) {
  const electron = [];
  const ordinary = [];
  for (const file of tests) {
    (isElectronAbiTest(file) ? electron : ordinary).push(file);
  }
  return { electron, ordinary };
}

export function resolveCappedTypecheckScripts(level) {
  if (level === 'shared') return ['typecheck:shared'];
  if (level === 'android') return ['typecheck:android'];
  if (level === 'ios') return [];
  if (level === 'full') return ['typecheck:desktop', 'typecheck:shared', 'typecheck:android'];
  return ['typecheck:desktop'];
}

async function runInherited(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function defaultRunStep(label, command, args, env, runner) {
  console.log(`[quality-fast-capped] running: ${label}`);
  const code = await runner(command, args, { env, label });
  if (code !== 0) throw new Error(`${label} failed`);
}

export async function runCappedHeavyPlan(plan, options = {}) {
  const env = options.env ?? process.env;
  const runner = options.runner ?? runInherited;
  const runStep = options.runStep ?? defaultRunStep;
  if (plan.lintTargets.length > 0) {
    await runStep('scoped lint', process.execPath, [
      'node_modules/eslint/bin/eslint.js', '--cache', '--cache-location',
      options.cacheLocation ?? '.tmp/eslint-cache/quality-fast-capped/', ...plan.lintTargets
    ], env, runner);
  } else {
    console.log('[quality-fast-capped] no lintable changed files detected - skipping scoped lint');
  }
  for (const script of resolveCappedTypecheckScripts(plan.level)) {
    const typecheck = resolveNpmRunCommand(script, env);
    await runStep(script, typecheck.command, typecheck.args, env, runner);
  }
  const related = splitRelatedTests(plan.relatedTests);
  if (related.ordinary.length > 0) {
    await runStep('related tests', process.execPath, ['scripts/test-files.mjs', ...related.ordinary], env, runner);
  }
  if (related.electron.length > 0) {
    await runStep('electron related tests', process.execPath, [
      'scripts/electron-sqlite-runner.mjs', 'scripts/test-files.mjs', ...related.electron
    ], env, runner);
  }
  if (plan.relatedTests.length === 0) {
    console.log('[quality-fast-capped] no related test files detected - skipping tests');
  }
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const plan = JSON.parse(await readStdin());
  await runCappedHeavyPlan(plan);
  console.log(`[quality-fast-capped] local ${plan.level} checks passed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[quality-fast-capped] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
