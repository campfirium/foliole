#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const MAS_ELECTRON_DIRECTORY = '.tmp/electron-mas-arm64';
const CONTRACT_FILE = '.foliole-electron-runtime.json';

function extractArchive(source, target) {
  const result = spawnSync('ditto', ['-x', '-k', source, target], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`MAS Electron extraction failed with exit code ${result.status}`);
}

async function readJson(filePath, read = readFile) {
  return JSON.parse(await read(filePath, 'utf8'));
}

export async function resolveMasElectronContract(repositoryRoot = ROOT, read = readFile) {
  const metadata = await readJson(path.join(repositoryRoot, 'node_modules/electron/package.json'), read);
  return { arch: 'arm64', platform: 'mas', version: metadata.version };
}

export async function inspectMasElectronRuntime(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? ROOT;
  const destination = options.destination ?? path.join(repositoryRoot, MAS_ELECTRON_DIRECTORY);
  const expected = options.expected ?? await resolveMasElectronContract(repositoryRoot, options.read);
  try {
    const actual = await readJson(path.join(destination, CONTRACT_FILE), options.read);
    await (options.access ?? access)(path.join(destination, 'Electron.app'));
    return { actual, destination, expected, ready: JSON.stringify(actual) === JSON.stringify(expected) };
  } catch {
    return { actual: null, destination, expected, ready: false };
  }
}

export async function assertMasElectronRuntime(options = {}) {
  const inspection = await inspectMasElectronRuntime(options);
  if (inspection.ready) return inspection.destination;
  const actual = inspection.actual?.version ?? 'missing';
  throw new Error(
    `Local MAS Electron runtime is not prepared: expected ${inspection.expected.version}, found ${actual}. ` +
    'Run npm run macos:internal:prepare-runtime before dispatching an Internal update.'
  );
}

export async function prepareMasElectronRuntime(options = {}) {
  const inspection = await inspectMasElectronRuntime(options);
  if (inspection.ready) return inspection.destination;
  await (options.remove ?? rm)(inspection.destination, { force: true, recursive: true });
  await (options.makeDirectory ?? mkdir)(inspection.destination, { recursive: true });
  const download = options.download ?? (await import('@electron/get')).downloadArtifact;
  const archive = await download({ ...inspection.expected, artifactName: 'electron' });
  await (options.extract ?? extractArchive)(archive, inspection.destination);
  await (options.write ?? writeFile)(
    path.join(inspection.destination, CONTRACT_FILE),
    `${JSON.stringify(inspection.expected, null, 2)}\n`
  );
  return inspection.destination;
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.log('[internal-runtime] skipped: MAS Electron is only required on Apple silicon macOS');
    return;
  }
  console.log(`[internal-runtime] ready ${await prepareMasElectronRuntime()}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
