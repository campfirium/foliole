/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { splitRelatedTests } from './quality-fast-capped.mjs';

const VITEST_ARGS = [
  '--silent=passed-only',
  '--pool=threads',
  '--maxWorkers=2',
  '--no-file-parallelism'
];
const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runInherited(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export function buildRelatedTestSteps(tests) {
  const related = splitRelatedTests(tests);
  const steps = [];
  if (related.ordinary.length > 0) {
    steps.push({
      args: [
        path.join(SCRIPTS_DIR, 'run-vitest-with-summary.mjs'), '.tmp/vitest/related.json',
        '--', ...VITEST_ARGS, ...related.ordinary
      ],
      label: 'ordinary related tests'
    });
  }
  if (related.electron.length > 0) {
    steps.push({
      args: [
        path.join(SCRIPTS_DIR, 'electron-sqlite-runner.mjs'),
        path.join(SCRIPTS_DIR, 'run-vitest-with-summary.mjs'), '.tmp/vitest/related-electron.json',
        '--', ...VITEST_ARGS, ...related.electron
      ],
      label: 'Electron ABI related tests'
    });
  }
  return steps;
}

export async function runRelatedTests(tests, runner = runInherited) {
  for (const step of buildRelatedTestSteps(tests)) {
    console.log(`[quality-fast-related-tests] running: ${step.label}`);
    const code = await runner(process.execPath, step.args);
    if (code !== 0) throw new Error(`${step.label} failed`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runRelatedTests(process.argv.slice(2)).catch((error) => {
    console.error(`[quality-fast-related-tests] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
