#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

import { auditCaptureAnnotationDatabase } from '../android/android-capture-annotation-audit.mjs';
import { openReadonlySqliteDatabase } from '../android/sqlite-readonly.mjs';
import { pullAndroidReviewSnapshot } from './windows-android-lab-review-snapshot.mjs';

const APP_ID = 'com.foliole.android';
const APP_COMPONENT = `${APP_ID}/com.foliole.android.MainActivity`;
const TOKEN = /^[A-Za-z0-9._-]{8,80}$/u;

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--token' || !TOKEN.test(argv[1])) {
    throw new Error('capture annotation audit requires --token <8..80 safe characters>');
  }
  return argv[1];
}

function adbArgs(port, serial, ...args) {
  return [...(port ? ['-P', port] : []), '-s', serial, ...args];
}

function run(command, args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    const stdout = [];
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'));
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited ${code}`));
    });
  });
}

export async function runCaptureAnnotationAudit({ argv = process.argv.slice(2), env = process.env } = {}) {
  const token = parseArgs(argv);
  const adb = env.FOLIOLE_ANDROID_ADB_PATH;
  const port = env.FOLIOLE_ANDROID_ADB_SERVER_PORT || '';
  const serial = env.FOLIOLE_ANDROID_SERIAL;
  const evidenceRoot = env.FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT;
  if (!adb || !serial || !evidenceRoot) throw new Error('verified Lab audit environment is missing');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await run(adb, adbArgs(port, serial, 'shell', 'am', 'force-stop', APP_ID));
  const databasePath = await pullAndroidReviewSnapshot({
    adbPath: adb, adbServerPort: port, appStopped: true, destination: evidenceRoot, endpoint: serial
  });
  const db = await openReadonlySqliteDatabase(databasePath);
  let summary;
  try {
    summary = auditCaptureAnnotationDatabase(db, token);
  } finally {
    db.close();
  }
  fs.writeFileSync(path.join(evidenceRoot, 'capture-annotation-db-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await run(adb, adbArgs(port, serial, 'shell', 'am', 'start', '-n', APP_COMPONENT));
  console.log(JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCaptureAnnotationAudit().catch((error) => {
    console.error(`[windows-android-lab-capture-annotation-audit] ${error.message}`);
    process.exitCode = 1;
  });
}
