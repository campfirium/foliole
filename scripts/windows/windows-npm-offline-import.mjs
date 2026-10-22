/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

const IMPORT_CHUNK = 100;

function stageError(stage, message, output = '') {
  return Object.assign(new Error(message), { output, stage });
}

async function run(execute, paths, command, args, stage, timeoutMs = 10 * 60_000) {
  const result = await execute(command, args, { cwd: paths.repoRoot, timeoutCode: `${stage}_timeout`,
    timeoutMs, windowsHide: true });
  if (result.code !== 0) {
    const detail = String(result.lines?.at(-1) || result.stderr || result.output || '').trim();
    throw stageError(stage, `${stage} exited ${result.code}: ${detail.slice(0, 300)}`, result.output);
  }
  return result;
}

// `npm ci` deletes node_modules first, so a Gradle daemon or DEV client holding
// files there must stop the install before anything is removed.
export async function assertNodeModulesUnoccupied({ execute, paths }) {
  const script = path.join(paths.repoRoot, 'scripts', 'windows', 'windows-dev-process-snapshot.ps1');
  const result = await run(execute, paths, 'powershell.exe', ['-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass', '-File', script, '-RepoRoot', paths.repoRoot],
  'dependencies-occupied', 30_000);
  const parsed = JSON.parse(String(result.stdout ?? '').replace(/^\uFEFF/u, '').trim() || '[]');
  const holders = Array.isArray(parsed) ? parsed : [parsed];
  if (holders.length > 0) {
    const names = holders.map((entry) => `${entry.Name}#${entry.ProcessId}`).join(', ');
    throw stageError('dependencies-occupied',
      `repository processes are running and may hold node_modules: ${names}; stop them before reinstalling`);
  }
}

// Imports the tarball bundle the Mac transferred for this exact lock into the
// npm cache, so the following `npm ci --offline` finds every locked package.
export async function importWindowsNpmBundle({ execute, fsApi, paths }) {
  const lockBlob = (await run(execute, paths, paths.gitPath,
    ['rev-parse', 'HEAD:package-lock.json'], 'dependencies-bundle')).stdout.trim();
  const artifacts = path.join(paths.repoRoot, '.tmp', 'artifacts');
  const bundle = path.join(artifacts, `windows-npm-bundle-${lockBlob}.tar`);
  if (!fsApi.existsSync(bundle)) {
    throw stageError('dependencies-bundle', `npm bundle for lock ${lockBlob} was not transferred to ${bundle}`);
  }
  const root = path.join(artifacts, 'windows-npm-offline', lockBlob);
  fsApi.rmSync(root, { force: true, recursive: true });
  fsApi.mkdirSync(root, { recursive: true });
  await run(execute, paths, paths.tarPath, ['-xf', bundle, '-C', root], 'dependencies-bundle');
  const manifest = JSON.parse(fsApi.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.lockBlob !== lockBlob || !Array.isArray(manifest.files)) {
    throw stageError('dependencies-bundle', `npm bundle manifest does not describe lock ${lockBlob}`);
  }
  let output = '';
  const files = manifest.files.map(({ file }) => path.join(root, 'tarballs', file));
  for (let index = 0; index < files.length; index += IMPORT_CHUNK) {
    const result = await run(execute, paths, paths.systemNode, [paths.systemNpmCli, 'cache', 'add',
      '--offline', ...files.slice(index, index + IMPORT_CHUNK)], 'dependencies-bundle');
    output += result.output ?? '';
  }
  fsApi.rmSync(root, { force: true, recursive: true });
  return { count: files.length, lockBlob, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await importWindowsNpmBundle({ execute: executeBounded, fsApi: fs, paths: windowsDevPaths() });
    console.log(`[windows-npm-offline-import] imported ${result.count} package(s) for lock ${result.lockBlob}`);
  } catch (error) {
    console.error(`[windows-npm-offline-import] stage=${error.stage ?? 'unknown'} ${error.message}`);
    process.exitCode = 1;
  }
}
