import { spawnSync } from 'node:child_process';

const INTERNAL_BUNDLE_ID = 'com.campfirium.foliole';
const EXIT_TIMEOUT_MS = 30_000;

function assertSucceeded(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
  return result;
}

function assertQuitSucceeded(result) {
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error('Timed out waiting for Foliole to exit');
  }
  return assertSucceeded('request Foliole Internal quit', result);
}

export function createInternalLifecycle(options = {}) {
  const run = options.run ?? spawnSync;
  const targetPath = options.targetPath;
  const timeoutMs = options.timeoutMs ?? EXIT_TIMEOUT_MS;
  if (!targetPath) throw new Error('Foliole Internal lifecycle requires an explicit app path');

  return {
    isRunning() {
      const result = assertSucceeded('check Foliole Internal state', run('osascript', [
        '-e', `application id "${INTERNAL_BUNDLE_ID}" is running`
      ], { encoding: 'utf8' }));
      return result.stdout.trim() === 'true';
    },
    async quitAndWait() {
      assertQuitSucceeded(run('osascript', [
        '-e', `tell application id "${INTERNAL_BUNDLE_ID}" to quit`
      ], { stdio: 'ignore', timeout: timeoutMs }));
    },
    open() {
      assertSucceeded('open installed Foliole Internal', run('open', ['-g', '-a', targetPath], {
        stdio: 'ignore'
      }));
    }
  };
}
