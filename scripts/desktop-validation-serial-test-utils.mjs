/* global process */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERIAL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'desktop-validation-serial.mjs');

function serialProcess({ commands, runtimeDir, runLabel, extraEnv = {} }) {
  const child = spawn(process.execPath, [SERIAL_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DESKTOP_VALIDATION_SERIAL_COMMANDS_JSON: JSON.stringify(commands),
      FOLIOLE_RESOURCE_GATE_HELD: '',
      DESKTOP_VALIDATION_SERIAL_PROGRESS_MS: '50',
      DESKTOP_VALIDATION_SERIAL_POLL_MS: '25',
      DESKTOP_VALIDATION_SERIAL_RUNTIME_DIR: runtimeDir,
      SERIAL_TEST_RUN_LABEL: runLabel,
      ...extraEnv
    }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const close = new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
  return { child, close };
}

function runSerial({ commands, runtimeDir, runLabel, extraEnv = {} }) {
  return serialProcess({ commands, extraEnv, runLabel, runtimeDir }).close;
}

async function createStub(tempDir) {
  const script = path.join(tempDir, 'stub-command.mjs');
  await writeFile(
    script,
    [
      "import { appendFile } from 'node:fs/promises';",
      "import { setTimeout as delay } from 'node:timers/promises';",
      "const [label, ms = '0', code = '0'] = process.argv.slice(2);",
      "const run = process.env.SERIAL_TEST_RUN_LABEL ?? 'unknown';",
      "await appendFile(process.env.SERIAL_TEST_LOG, `${run}:${label}:start\\n`);",
      'await delay(Number(ms));',
      "await appendFile(process.env.SERIAL_TEST_LOG, `${run}:${label}:end\\n`);",
      'process.exit(Number(code));'
    ].join('\n'),
    'utf8'
  );
  return script;
}

async function withTempFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'desktop-validation-serial-'));
  try {
    const runtimeDir = path.join(tempDir, 'runtime');
    const logFile = path.join(tempDir, 'commands.log');
    const stub = await createStub(tempDir);
    return await fn({ logFile, runtimeDir, stub, tempDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function stubCommands(stub, lintMs = 50, previewMs = 50, lintCode = 0) {
  return [
    [process.execPath, stub, 'lint', String(lintMs), String(lintCode)],
    [process.execPath, stub, 'preview', String(previewMs), '0']
  ];
}

async function writeDeadLock(runtimeDir) {
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    path.join(runtimeDir, 'resource-gate.node-heavy.lock'),
    `${JSON.stringify({
      className: 'preview',
      command: 'validate:desktop:serial',
      heartbeatAt: Date.now(),
      pid: 99999999,
      resource: 'node-heavy',
      schemaVersion: 1,
      startedAt: Date.now()
    })}\n`,
    'utf8'
  );
}

async function waitForFile(filePath, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await readFile(filePath, 'utf8');
      return;
    } catch (error) {
      if (!('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

export { runSerial, serialProcess, stubCommands, waitForFile, withTempFixture, writeDeadLock };
