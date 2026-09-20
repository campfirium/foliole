/* global process */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = 'com.foliole.android';
const TEST_ID = `${APP_ID}.test`;
const TEST_CLASS = `${APP_ID}.FolioleMobileNodeLinkTest`;

export function assertMobileLinkOutput(output) {
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output) || !/OK \(1 test\)/u.test(output)) {
    throw new Error('Android system URL navigation did not pass.');
  }
  const match = output.match(/foliole_mobile_link=(\{[^\n]+\})/u);
  const facts = match ? JSON.parse(match[1]) : null;
  for (const key of ['cold', 'foreground', 'missingRejected', 'invalidRejected', 'wrongGroupRejected', 'reopen', 'protectedDataPreserved']) {
    if (facts?.[key] !== true) throw new Error(`Android URL evidence is missing: ${key}`);
  }
  return facts;
}

export async function runMacosA5MobileLinkEntry(args) {
  args.assertFixed();
  args.build();
  const runId = args.buildIdentity();
  const root = path.join(args.paths.artifactsRoot, 'a5-mobile-link', runId);
  const manifest = path.join(root, 'baseline.json');
  const backup = path.join(args.paths.deviceBackupRoot, runId);
  fs.mkdirSync(root, { recursive: true });
  args.markMutationBoundary?.();
  const command = (argv) => args.checked(args.paths.adb, ['-s', args.serial, ...argv]);
  let installed = false;
  let failure;
  const cleanupErrors = [];
  let facts;
  try {
    command(['shell', 'am', 'force-stop', APP_ID]);
    await args.protectData('backup', manifest, backup);
    command(['install', '-r', args.paths.apk]);
    await args.protectData('check', manifest, backup);
    command(['install', '-r', '-t', args.paths.androidTestApk]);
    installed = true;
    const result = await args.execute(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', TEST_CLASS, `${TEST_ID}/androidx.test.runner.AndroidJUnitRunner`],
    { env: args.env, timeoutCode: 'mobile_link_timeout', timeoutMs: 240_000 });
    fs.writeFileSync(path.join(root, 'instrumentation.log'), result.output ?? '');
    if (result.code !== 0) throw new Error('Android URL instrumentation failed.');
    facts = assertMobileLinkOutput(result.output);
    for (const name of ['mobile-link-cold.png', 'mobile-link-foreground.png', 'mobile-link-rejected.png']) {
      const bytes = execFileSync(args.paths.adb, ['-s', args.serial, 'exec-out', 'run-as', APP_ID,
        'cat', `files/${name}`], { env: args.env, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
      fs.writeFileSync(path.join(root, name), bytes);
    }
  } catch (error) { failure = error; }
  for (const cleanup of [
    () => installed && command(['uninstall', TEST_ID]),
    () => command(['shell', 'am', 'force-stop', APP_ID]),
    () => restoreApp(args, command)
  ]) {
    try { await cleanup(); } catch (error) { cleanupErrors.push(error.message); failure ??= error; }
  }
  fs.writeFileSync(path.join(root, 'mobile-link.json'), `${JSON.stringify({ runId, serial: args.serial,
    facts, cleanupErrors, resultStatus: failure ? 'failed' : 'success', error: failure?.message ?? null }, null, 2)}\n`);
  if (failure) throw failure;
  return { evidencePath: path.join(root, 'mobile-link.json') };
}

function restoreApp(args, command) {
  command(['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);
  args.checked(process.execPath, [path.join(args.paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', args.paths.adb, '--serial', args.serial, '--app-id', APP_ID,
    '--component', `${APP_ID}/.MainActivity`, '--timeout-seconds', '30', '--stability-seconds', '3']);
}
