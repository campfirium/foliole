/* global console */

import { spawnSync } from 'node:child_process';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { createDogfoodDailyLifecycle } from './dogfood-daily-lifecycle.mjs';

const INSTALLED_APP = '/Applications/Foliole.app';

function runStep(label, command, args, run) {
  const result = run(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function moveIfPresent(source, target, move) {
  try {
    await move(source, target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function reopenQuietly(lifecycle) {
  try {
    lifecycle.open();
  } catch {
    // Recovery keeps the installed app intact even when relaunch also fails.
  }
}

async function restorePreviousApp({ backupPath, lifecycle, move, remove, targetPath }) {
  await remove(targetPath, { force: true, recursive: true });
  await move(backupPath, targetPath);
  reopenQuietly(lifecycle);
}

export async function installMasDevelopmentApp(options = {}) {
  const sourcePath = options.sourcePath;
  if (!sourcePath) throw new Error('MAS development installation requires an explicit temporary app path');
  const targetPath = options.targetPath ?? INSTALLED_APP;
  const run = options.run ?? spawnSync;
  const remove = options.remove ?? rm;
  const move = options.move ?? rename;
  const makeTempDirectory = options.makeTempDirectory ?? mkdtemp;
  const lifecycle = options.lifecycle ?? createDogfoodDailyLifecycle({ targetPath });
  const log = options.log ?? console.log;
  const stagingRoot = await makeTempDirectory(path.join(path.dirname(targetPath), '.foliole-internal-install-'));
  const stagedPath = path.join(stagingRoot, 'Foliole.app');
  const backupPath = path.join(stagingRoot, 'previous.app');
  let preserveStaging = false;
  try {
    runStep('stage internal app', 'ditto', [sourcePath, stagedPath], run);
    runStep('verify staged internal app', 'codesign', ['--verify', '--deep', '--strict', stagedPath], run);
    log('[macos-package] stage: VERIFIED');
    if (lifecycle.isRunning()) {
      log('[macos-package] stage: QUIT_REQUESTED');
      await lifecycle.quitAndWait();
    }
    if (lifecycle.isRunning()) throw new Error('Dogfood Daily is still running after the exit wait');
    log('[macos-package] stage: EXIT_CONFIRMED');
    let hadInstalledApp;
    try {
      hadInstalledApp = await moveIfPresent(targetPath, backupPath, move);
    } catch (error) {
      reopenQuietly(lifecycle);
      throw error;
    }
    try {
      if (lifecycle.isRunning()) throw new Error('Dogfood Daily reopened before the app swap');
      await move(stagedPath, targetPath);
      log('[macos-package] stage: INSTALLED');
      lifecycle.open();
      log('[macos-package] stage: REOPENED');
    } catch (error) {
      if (!hadInstalledApp) {
        await remove(targetPath, { force: true, recursive: true });
        throw error;
      }
      try {
        await restorePreviousApp({ backupPath, lifecycle, move, remove, targetPath });
      } catch (recoveryError) {
        preserveStaging = true;
        throw new AggregateError(
          [error, recoveryError],
          `Dogfood Daily recovery failed; previous app preserved at ${backupPath}`
        );
      }
      throw error;
    }
  } finally {
    if (!preserveStaging) await remove(stagingRoot, { force: true, recursive: true });
  }
}
