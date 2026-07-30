#!/usr/bin/env node
/* global console, process */

import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditDatabases, formatAuditReport } from './android-sync-audit-core.mjs';

const DEFAULT_DESKTOP_DB = '/mnt/d/X/U/Foliole/Data/foliole.db';

function parseArgs(argv) {
  const options = {
    androidDb: '',
    desktopDb: process.env.FOLIOLE_DESKTOP_DB || DEFAULT_DESKTOP_DB,
    keep: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--android-db' && value) options.androidDb = value;
    if (key === '--desktop-db' && value) options.desktopDb = value;
    if (key === '--keep') options.keep = true;
    if (key.startsWith('--') && key !== '--keep' && value) index += 1;
  }
  return options;
}

function assertAndroidAuditHost(options) {
  if (options.androidDb) return;
  throw new Error('Pass --android-db with an explicit local read-only Android database copy.');
}

async function copySqliteSnapshot(sourcePath, outputDir, outputName) {
  const outputPath = path.join(outputDir, outputName);
  await copyFile(sourcePath, outputPath);
  const sidecars = [];
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${sourcePath}${suffix}`)) {
      await copyFile(`${sourcePath}${suffix}`, `${outputPath}${suffix}`);
      sidecars.push(suffix);
    }
  }
  return { outputPath, sidecars, sourcePath };
}

async function pullAndroidDatabase(options, outputDir) {
  return copySqliteSnapshot(options.androidDb, outputDir, path.basename(options.androidDb));
}

async function runAudit(options) {
  assertAndroidAuditHost(options);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-sync-audit-'));
  try {
    await mkdir(tempDir, { recursive: true });
    const desktop = await copySqliteSnapshot(options.desktopDb, tempDir, 'desktop.db');
    const android = await pullAndroidDatabase(options, tempDir);
    const report = auditDatabases(desktop.outputPath, android.outputPath, { serial: 'local-db' });
    return { report, tempDir: options.keep ? tempDir : null };
  } finally {
    if (!options.keep) await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runAudit(parseArgs(process.argv.slice(2)))
    .then(({ report, tempDir }) => {
      console.log(formatAuditReport(report));
      if (tempDir) console.log(`\nkept snapshots: ${tempDir}`);
    })
    .catch((error) => {
      console.error(`[android-sync-audit] FAILED ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}

export { assertAndroidAuditHost, parseArgs, runAudit };
