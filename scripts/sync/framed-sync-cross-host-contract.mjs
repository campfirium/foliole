import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { macosA5GradleEnv } from '../android/macos-a5-runtime-paths.mjs';

const COMMANDS = [
  ['node', ['scripts/sync/generate-framed-sync-golden.mjs', '--check']],
  ['npm', ['run', 'test:files', '--',
    'lib/core/sync/framedSyncGolden.test.ts',
    'lib/core/sync/framedSyncProtocolCodec.boundaries.test.ts']],
  ['./gradlew', ['--no-daemon', 'testDebugUnitTest',
    '--tests', 'com.foliole.android.framed.FramedSyncGoldenCorpusTest',
    '--tests', 'com.foliole.android.framed.FramedSyncCodecTest',
    '--tests', 'com.foliole.android.framed.FramedSyncMaliciousBoundaryTest',
    '--tests', 'com.foliole.android.framed.FramedSyncHttpTransportTest']],
  ['swift', ['test', '--package-path', 'ios/App', '--filter', 'FramedSync']]
];

for (const [command, args] of COMMANDS) {
  const result = spawnSync(command, args, {
    cwd: command === './gradlew' ? 'android' : process.cwd(),
    env: command === './gradlew' && process.platform === 'darwin'
      ? macosA5GradleEnv(process.env) : process.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
