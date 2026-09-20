/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { imageProjectionMode, runImageProjection } from './macos-a5-image-projection.mjs';

const APP_ID = 'com.foliole.android';
const TEST_ID = `${APP_ID}.test`;
export const IMAGE_TEST_CLASS = `${APP_ID}.FolioleRemoteImageFilesTest`;

export function assertImageContractOutput(output) {
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output) || !/OK \(4 tests\)/u.test(output)) {
    throw new Error('Android image native contracts did not pass all four tests.');
  }
}

export async function runMacosA5ImageContractEntry(args) {
  const projectionMode = imageProjectionMode(args.env);
  args.assertFixed();
  const disposableData = args.env.FOLIOLE_A5_TEST_DATA_DISPOSABLE === '1';
  if (!disposableData) {
    args.pairingReadiness(args.paths);
    args.readiness(args.paths);
  }
  args.build();
  const runId = args.buildIdentity();
  const root = path.join(args.paths.artifactsRoot, 'a5-image-contract', runId);
  const manifest = path.join(root, 'baseline.json');
  const backup = path.join(args.paths.deviceBackupRoot, runId);
  fs.mkdirSync(root, { recursive: true });
  args.markMutationBoundary?.();
  let installed = false;
  let protectedData = false;
  let failure;
  const command = (argv) => args.checked(args.paths.adb, ['-s', args.serial, ...argv]);
  try {
    command(['shell', 'am', 'force-stop', APP_ID]);
    if (!disposableData) await args.protectData('backup', manifest, backup);
    protectedData = !disposableData;
    command(['install', '-r', args.paths.apk]);
    command(['install', '-r', '-t', args.paths.androidTestApk]);
    installed = true;
    const result = await args.execute(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', IMAGE_TEST_CLASS, `${TEST_ID}/androidx.test.runner.AndroidJUnitRunner`],
    { env: args.env, timeoutCode: 'image_contract_timeout', timeoutMs: 180_000 });
    fs.writeFileSync(path.join(root, 'instrumentation.log'), result.output ?? '');
    if (result.code !== 0) throw Object.assign(new Error('Android image instrumentation failed'), { result });
    assertImageContractOutput(result.output);
    await runImageProjection(args, root, projectionMode);
  } catch (error) { failure = error; }
  for (const cleanup of [
    () => installed && command(['uninstall', TEST_ID]),
    () => command(['shell', 'am', 'force-stop', APP_ID]),
    () => protectedData && args.protectData('check', manifest, backup)
  ]) {
    try { await cleanup(); } catch (error) { failure ??= error; }
  }
  try {
    command(['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);
    args.checked(process.execPath, [path.join(args.paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
      '--adb', args.paths.adb, '--serial', args.serial, '--app-id', APP_ID,
      '--component', `${APP_ID}/.MainActivity`, '--timeout-seconds', '30', '--stability-seconds', '3']);
  } catch (error) { failure ??= error; }
  const evidencePath = path.join(root, 'image-contract.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ runId, serial: args.serial,
    testClass: IMAGE_TEST_CLASS, disposableData, resultStatus: failure ? 'failed' : 'success',
    error: failure?.message ?? null, completedAt: new Date().toISOString() }, null, 2)}\n`);
  if (failure) throw failure;
  return { evidencePath };
}
