#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyPackagedAgentCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const launcher = path.resolve(rootDir, 'artifacts', 'windows', 'win-unpacked', 'bin', 'foliole.cmd');
  const userData = await mkdtemp(path.join(os.tmpdir(), 'foliole-public-cli-'));
  const env = {
    ...process.env,
    FOLIOLE_USER_DATA_PATH: userData,
    PATH: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  };
  try {
    const version = await runJson(launcher, ['--version'], env, options.spawn);
    const help = await runJson(launcher, ['help', '--json'], env, options.spawn);
    const unavailable = await runJson(launcher, ['materials/read', '--id', 'missing'], env, options.spawn, 3);
    if (version.output.name !== 'foliole' || typeof version.output.product_version !== 'string') throw new Error('Invalid packaged CLI version output.');
    if (help.output.name !== 'foliole' || !Array.isArray(help.output.commands)) throw new Error('Invalid packaged CLI help output.');
    if (unavailable.output.error !== 'session_unavailable') throw new Error('Invalid packaged CLI unavailable output.');
    return { helpCommands: help.output.commands.length, unavailableStatus: unavailable.status, version: version.output };
  } finally {
    await rm(userData, { force: true, recursive: true });
  }
}

function runJson(launcher, args, env, spawnOverride, expectedStatus = 0) {
  return new Promise((resolvePromise, reject) => {
    const child = (spawnOverride ?? spawn)(launcher, args, { env, shell: true, windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('exit', (status) => {
      if (status !== expectedStatus) return reject(new Error(`Packaged CLI exited ${status}: ${stderr}`));
      try {
        const trimmed = stdout.trim();
        if (!trimmed || trimmed.split(/\r?\n/u).length !== 1) throw new Error('stdout was not one JSON line.');
        resolvePromise({ output: JSON.parse(trimmed), status });
      } catch (error) {
        reject(error);
      }
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyPackagedAgentCli()));
}
