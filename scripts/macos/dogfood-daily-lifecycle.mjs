/* global setTimeout, clearTimeout */

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const DAILY_BUNDLE_ID = 'com.campfirium.foliole';
const EXIT_TIMEOUT_MS = 30_000;

function assertSucceeded(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
  return result;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for Foliole to exit'));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`macOS app exit waiter failed with exit code ${code}`));
    });
  });
}

export function createDogfoodDailyLifecycle(options = {}) {
  const run = options.run ?? spawnSync;
  const start = options.start ?? spawn;
  const targetPath = options.targetPath;
  const timeoutMs = options.timeoutMs ?? EXIT_TIMEOUT_MS;
  if (!targetPath) throw new Error('Dogfood Daily lifecycle requires an explicit app path');

  return {
    isRunning() {
      const result = assertSucceeded('check Dogfood Daily state', run('osascript', [
        '-e', `application id "${DAILY_BUNDLE_ID}" is running`
      ], { encoding: 'utf8' }));
      return result.stdout.trim() === 'true';
    },
    async quitAndWait() {
      const waiter = start('open', ['-W', '-g', '-a', targetPath], { stdio: 'ignore' });
      const completion = waitForExit(waiter, timeoutMs);
      try {
        await once(waiter, 'spawn');
        assertSucceeded('request Dogfood Daily quit', run('osascript', [
          '-e', `tell application id "${DAILY_BUNDLE_ID}" to quit`
        ], { stdio: 'ignore' }));
        await completion;
      } catch (error) {
        if (waiter.exitCode === null) waiter.kill();
        try {
          await completion;
        } catch {
          // Preserve the original lifecycle failure after settling the waiter.
        }
        throw error;
      }
    },
    open() {
      assertSucceeded('open installed Dogfood Daily', run('open', ['-g', '-a', targetPath], {
        stdio: 'ignore'
      }));
    }
  };
}
