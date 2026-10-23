import fs from 'node:fs';
import path from 'node:path';
import { buildA5DatabasePerformance, PERFORMANCE_APP_ID } from './a5-database-performance-build.mjs';
import { removeA5AcceptanceTestApplication } from './macos-a5-acceptance-package-cleanup.mjs';

export async function runIsolatedImageContract(args, testClass, validateOutput, dependencies) {
  args.assertFixed();
  const build = dependencies.buildIsolated ?? buildA5DatabasePerformance;
  build({ ...args, env: { ...args.env, FOLIOLE_DATABASE_PERFORMANCE_SCENARIO: 'native-contracts' } });
  const cleanup = dependencies.cleanupTest ?? removeA5AcceptanceTestApplication;
  const runId = args.buildIdentity();
  const root = path.join(args.paths.artifactsRoot, 'a5-image-contract', runId);
  fs.mkdirSync(root, { recursive: true });
  const options = { env: args.env, timeoutCode: 'image_contract_timeout', timeoutMs: 180_000 };
  const command = argv => args.checked(args.paths.adb, ['-s', args.serial, ...argv]);
  let testInstalled = false;
  let failure;
  args.markMutationBoundary?.();
  try {
    command(['install', '-r', args.paths.apk]);
    command(['install', '-r', '-t', args.paths.androidTestApk]);
    testInstalled = true;
    const result = await args.execute(args.paths.adb, ['-s', args.serial,
      'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', testClass,
      `${PERFORMANCE_APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`], options);
    fs.writeFileSync(path.join(root, 'instrumentation.log'), result.output ?? '');
    if (result.code !== 0) throw Object.assign(new Error('Android image instrumentation failed'), { result });
    validateOutput(result.output);
  } catch (error) { failure = error; }
  if (testInstalled) {
    try { await cleanup(args, options); } catch (error) { failure ??= error; }
  }
  const evidencePath = path.join(root, 'image-contract.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ runId, serial: args.serial,
    appId: PERFORMANCE_APP_ID, testClass, resultStatus: failure ? 'failed' : 'success',
    error: failure?.message ?? null, completedAt: new Date().toISOString() }, null, 2)}\n`);
  if (failure) throw failure;
  return { evidencePath };
}
