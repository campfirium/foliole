/* global process */
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = 'com.foliole.android';
const TEST_ID = `${APP_ID}.test`;
export const RESOURCE_PROVIDER_TEST = `${APP_ID}.FolioleResourceProviderTest`;

export function assertResourceProviderOutput(output) {
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output) || !/OK \(4 tests\)/u.test(output)) {
    throw new Error('Android resource provider native contracts did not pass all four tests.');
  }
}

export async function runMacosA5ResourceProviderEntry(args) {
  args.assertFixed();
  args.build();
  const runId = args.buildIdentity();
  const root = path.join(args.paths.artifactsRoot, 'a5-resource-provider', runId);
  const manifest = path.join(root, 'baseline.json');
  const backup = path.join(args.paths.deviceBackupRoot, runId);
  fs.mkdirSync(root, { recursive: true });
  args.markMutationBoundary?.();
  const command = (argv) => args.checked(args.paths.adb, ['-s', args.serial, ...argv]);
  let installed = false;
  let protectedData = false;
  let failure;
  try {
    command(['shell', 'am', 'force-stop', APP_ID]);
    await args.protectData('backup', manifest, backup);
    protectedData = true;
    command(['install', '-r', args.paths.apk]);
    command(['install', '-r', '-t', args.paths.androidTestApk]);
    installed = true;
    const result = await args.execute(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', RESOURCE_PROVIDER_TEST, `${TEST_ID}/androidx.test.runner.AndroidJUnitRunner`],
    { env: args.env, timeoutCode: 'resource_provider_timeout', timeoutMs: 180_000 });
    fs.writeFileSync(path.join(root, 'instrumentation.log'), result.output ?? '');
    if (result.code !== 0) throw new Error('Android resource provider instrumentation failed.');
    assertResourceProviderOutput(result.output);
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
  const evidencePath = path.join(root, 'resource-provider.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ runId, serial: args.serial, testClass: RESOURCE_PROVIDER_TEST,
    resultStatus: failure ? 'failed' : 'success', error: failure?.message ?? null }, null, 2)}\n`);
  if (failure) throw failure;
  return { evidencePath };
}
