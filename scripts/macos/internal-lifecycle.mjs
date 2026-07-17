import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const INTERNAL_BUNDLE_ID = 'com.campfirium.foliole';
const EXIT_TIMEOUT_MS = 30_000;
const HELPER_STARTUP_GRACE_MS = 10_000;
const WAIT_FOR_EXIT_HELPER = fileURLToPath(new URL('./wait-for-app-exit.swift', import.meta.url));

function assertSucceeded(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
  return result;
}

function assertQuitSucceeded(result) {
  if (result.error?.code === 'ETIMEDOUT' || result.status === 2) {
    throw new Error('Timed out waiting for Foliole to exit');
  }
  return assertSucceeded('request and wait for Foliole Internal quit', result);
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
      assertQuitSucceeded(run('xcrun', [
        'swift', WAIT_FOR_EXIT_HELPER, INTERNAL_BUNDLE_ID, String(timeoutMs)
      ], { stdio: 'inherit', timeout: timeoutMs + HELPER_STARTUP_GRACE_MS }));
    },
    open() {
      assertSucceeded('open installed Foliole Internal', run('open', ['-g', '-a', targetPath], {
        stdio: 'ignore'
      }));
    }
  };
}
