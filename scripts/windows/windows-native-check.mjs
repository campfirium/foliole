#!/usr/bin/env node
/* global console, process */

import { npmRunCommand, runCapture } from './windows-preview-native-runtime.mjs';
import { WINDOWS_NATIVE_REPO_ROOT } from './windows-native-paths.mjs';

const SMOKE_STEPS = [
  { kind: 'npm', label: 'preflight', script: 'windows:native:preflight', extraArgs: ['--', '--json'] },
  {
    kind: 'npm',
    label: 'native path tests',
    script: 'test:files',
    extraArgs: ['--', 'scripts/windows/windows-native-paths.test.mjs', 'scripts/windows/windows-native-pilot-preflight.test.mjs']
  }
];

const FULL_STEPS = [
  { kind: 'npm', label: 'shared tests', script: 'test:shared' },
  { kind: 'npm', label: 'quality tests', script: 'test:quality' },
  { kind: 'npm', label: 'desktop typecheck', script: 'typecheck:desktop' },
  { kind: 'npm', label: 'desktop lint', script: 'lint:desktop' }
];

export function resolveWindowsNativeCheckSteps(argv = process.argv) {
  const full = argv.includes('--full');
  return full ? [...SMOKE_STEPS, ...FULL_STEPS] : SMOKE_STEPS;
}

function resolveStepCommand(step) {
  if (step.kind !== 'npm') {
    throw new Error(`unsupported check step kind: ${step.kind}`);
  }
  const command = npmRunCommand(step.script);
  return {
    args: [...command.args, ...(step.extraArgs ?? [])],
    command: command.command
  };
}

function tail(text) {
  return text.split(/\r?\n/u).filter(Boolean).slice(-20).join('\n');
}

async function runStep(step) {
  const command = resolveStepCommand(step);
  console.log(`[windows-native-check] step: ${step.label}`);
  const startedAt = Date.now();
  const result = await runCapture(command.command, command.args, { cwd: WINDOWS_NATIVE_REPO_ROOT });
  const durationMs = Date.now() - startedAt;
  const status = result.code === 0 ? 'PASSED' : 'FAILED';
  console.log(`[windows-native-check] ${step.label}: ${status} durationMs=${durationMs}`);
  if (result.code !== 0) {
    const detail = tail(`${result.stdout}\n${result.stderr}`);
    if (detail) {
      console.error(`[windows-native-check] ${step.label} tail:\n${detail}`);
    }
  }
  return { durationMs, label: step.label, status };
}

async function main() {
  const steps = resolveWindowsNativeCheckSteps();
  const results = [];
  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);
    if (result.status !== 'PASSED') {
      console.error(`[windows-native-check] status: FAILED firstFailed=${result.label}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`[windows-native-check] status: PASSED steps=${results.length}`);
}

if (process.argv[1] && process.argv[1].endsWith('windows-native-check.mjs')) {
  await main();
}
