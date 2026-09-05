/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { npmRunCommand } from './windows-preview-native-runtime.mjs';
import { WINDOWS_NATIVE_REPO_ROOT } from './windows-native-paths.mjs';

function packageHasScript(scriptName) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(WINDOWS_NATIVE_REPO_ROOT, 'package.json'), 'utf8'));
  return Boolean(packageJson.scripts?.[scriptName]);
}

async function runOptionalNpmScript(scriptName, env, runner, runStep) {
  if (!packageHasScript(scriptName)) {
    return;
  }
  const command = npmRunCommand(scriptName);
  await runStep(scriptName, command.command, command.args, env, runner);
}

async function runOptionalNodeScript(label, scriptPath, env, runner, runStep) {
  if (!fs.existsSync(path.join(WINDOWS_NATIVE_REPO_ROOT, scriptPath))) {
    return;
  }
  await runStep(label, process.execPath, [scriptPath], env, runner);
}

async function runScopedLint(plan, env, runner, runStep) {
  if (plan.lintTargets.length === 0) {
    console.log('[quality-fast-native] no lintable changed files detected - skipping scoped lint');
    return;
  }

  await runStep('scoped lint', process.execPath, [
    'node_modules/eslint/bin/eslint.js',
    '--cache',
    '--cache-location',
    '.tmp/eslint-cache/quality-fast-native/',
    ...plan.lintTargets
  ], env, runner);
}

async function runRelatedTests(plan, env, runner, runStep, splitRelatedTests) {
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
    console.log('[quality-fast-native] changes detected but no related tests found - skipping tests');
  }
}

export async function runNativeT0StaticGuards(env, runner, runStep) {
  await runOptionalNodeScript('specialized surface usage', 'scripts/check-specialized-surface-usage.mjs', env, runner, runStep);
  await runOptionalNodeScript('repository root boundary', 'scripts/check-repository-root-boundary.mjs', env, runner, runStep);
  await runOptionalNpmScript('deps:scan', env, runner, runStep);
}

export async function runNativeLightMidPlan(plan, options) {
  const { env, runner, runStep, splitRelatedTests } = options;
  await runOptionalNpmScript('copy:guard', env, runner, runStep);
  await runOptionalNpmScript('native-dialog:guard', env, runner, runStep);
  await runOptionalNpmScript('windows:console:guard', env, runner, runStep);
  await runOptionalNodeScript('layer dependency boundary', 'scripts/check-layer-dependency-boundary.mjs', env, runner, runStep);
  await runScopedLint(plan, env, runner, runStep);

  const typecheck = npmRunCommand('typecheck');
  await runStep('typecheck', typecheck.command, typecheck.args, env, runner);

  if (plan.level === 'mid') {
    await runOptionalNodeScript(
      'workspace settings boundary',
      'scripts/check-workspace-settings-boundary.mjs',
      env,
      runner,
      runStep
    );
  }
  await runRelatedTests(plan, env, runner, runStep, splitRelatedTests);
}
