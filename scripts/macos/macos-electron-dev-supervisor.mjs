/* global process */

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  processIsAlive,
  readElectronDevSnapshot,
  removeElectronDevClientState,
  removeElectronDevReadyMarkers,
  waitForElectronDevCondition,
  writeElectronDevClientState
} from '../desktop/electron-dev-control-state.mjs';
import { createElectronRuntimeWatcher } from '../desktop/electron-dev-runtime-watch.mjs';
import { withResourceGate } from '../lib/resource-gate.mjs';
import { maintainBeforeProduction } from '../diagnostics/local-artifact-cache-production.mjs';
import { requestMacosElectronRuntimeRestart, requestMacosElectronShellExit } from './macos-electron-dev-actions.mjs';
import { createMacosDailyEnvironment } from './macos-electron-dev-environment.mjs';
import { prepareMacosElectronDevSignature } from './macos-electron-dev-signature.mjs';
import {
  MACOS_DAILY_LIBRARY_HOME,
  resolveMacosElectronDevPaths,
  resolveMacosElectronWatchTargets
} from './macos-electron-dev-paths.mjs';
import {
  createMacosElectronDevLogger,
  runLoggedCommand,
  spawnLoggedChild
} from './macos-electron-dev-process.mjs';

function createCompileRunner({ env, logger, paths }) {
  let inFlight = null;
  return () => {
    if (inFlight) return inFlight;
    const tsc = path.join('node_modules', 'typescript', 'bin', 'tsc');
    inFlight = runLoggedCommand(process.execPath, [tsc, '-p', 'electron/tsconfig.json'], {
      cwd: paths.appRoot,
      env,
      logger
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
}

async function waitForSessionReady(paths, bootSession, timeoutMs) {
  return waitForElectronDevCondition({
    evaluate: () => {
      const snapshot = readElectronDevSnapshot(paths);
      return snapshot.running && snapshot.ready.appReady.session === bootSession ? snapshot : null;
    },
    label: 'macOS Electron daily debug startup',
    stateRoot: paths.dailyRoot,
    timeoutMs
  });
}

async function runSupervisorSession({ env, paths, registerStop, startupTimeoutMs }) {
  const logger = await createMacosElectronDevLogger(paths.dailyLogFile);
  const compile = createCompileRunner({ env, logger, paths });
  let active = null;
  let clientState = null;
  let fullRestartInFlight = false;
  let restartShell = false;
  let runtimeWatcher = null;
  let stopping = false;
  const persistClientState = async (patch = {}) => {
    clientState = { ...clientState, ...patch };
    await writeElectronDevClientState(paths, clientState);
  };

  const stop = async () => {
    stopping = true;
    runtimeWatcher?.close();
    runtimeWatcher = null;
    if (active?.child && active.child.exitCode === null && active.child.signalCode === null) {
      await requestMacosElectronShellExit({ paths, reason: 'macOS daily debug stop' });
      await active.closed;
    }
  };
  registerStop(stop);

  const requestFullRestart = async () => {
    if (stopping || fullRestartInFlight || !active) return;
    fullRestartInFlight = true;
    const controlId = randomUUID();
    await persistClientState({
      lastControl: { action: 'full-restart', id: controlId, status: 'compiling' }
    });
    logger.event('full_restart_compile_started');
    if (!await compile()) {
      logger.event('full_restart_compile_failed', 'old_shell_preserved=true');
      await persistClientState({
        lastControl: { action: 'full-restart', id: controlId, status: 'compile-failed' }
      });
      fullRestartInFlight = false;
      return;
    }
    if (stopping) {
      fullRestartInFlight = false;
      return;
    }
    restartShell = true;
    await persistClientState({
      lastControl: { action: 'full-restart', id: controlId, status: 'restarting' }
    });
    runtimeWatcher?.close();
    runtimeWatcher = null;
    logger.event('full_restart_shell_rebuild');
    await requestMacosElectronShellExit({ paths, reason: 'macOS daily debug full restart' });
  };
  const onSighup = () => { void requestFullRestart(); };
  process.on('SIGHUP', onSighup);

  try {
    await removeElectronDevClientState(paths);
    await removeElectronDevReadyMarkers(paths);
    await rm(paths.shellRequestFile, { force: true });
    let skipCompile = false;
    while (!stopping) {
      const bootSession = `macos-daily-${randomUUID()}`;
      const shellEnv = { ...env, FOLIOLE_BOOT_SESSION: bootSession };
      if (skipCompile) shellEnv.FOLIOLE_ELECTRON_DEV_SKIP_COMPILE = '1';
      else delete shellEnv.FOLIOLE_ELECTRON_DEV_SKIP_COMPILE;
      active = spawnLoggedChild(process.execPath, ['scripts/electron-dev.mjs', '--preview-sandbox'], {
        cwd: paths.appRoot,
        env: shellEnv,
        logger
      });
      clientState = {
        lastControl: clientState?.lastControl ?? null,
        logFile: paths.dailyLogFile,
        requestFile: paths.shellRequestFile,
        root: paths.dailyRoot,
        schema: 1,
        shellPid: active.child.pid,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid
      };
      await writeElectronDevClientState(paths, clientState);
      logger.event('shell_started', `pid=${active.child.pid} session=${bootSession}`);
      await Promise.race([
        waitForSessionReady(paths, bootSession, startupTimeoutMs),
        active.closed.then((result) => { throw new Error(`inner dev shell exited before ready code=${result.code}`); })
      ]);
      if (clientState.lastControl?.action === 'full-restart') {
        await persistClientState({
          lastControl: { ...clientState.lastControl, status: 'completed' }
        });
      }
      fullRestartInFlight = false;
      runtimeWatcher = createElectronRuntimeWatcher({
        log: (event, error) => logger.event(event, error instanceof Error ? error.message : ''),
        onCompile: compile,
        onRestart: () => fullRestartInFlight || stopping
          ? Promise.resolve()
          : requestMacosElectronRuntimeRestart({ paths, reason: 'Electron compile inputs changed' }),
        onWatchError: () => { void stop(); },
        targets: resolveMacosElectronWatchTargets(paths)
      });
      const result = await active.closed;
      runtimeWatcher?.close();
      runtimeWatcher = null;
      if (restartShell && !stopping) {
        restartShell = false;
        skipCompile = true;
        await removeElectronDevReadyMarkers(paths);
        await rm(paths.shellRequestFile, { force: true });
        continue;
      }
      return result.code;
    }
    return 0;
  } finally {
    process.off('SIGHUP', onSighup);
    runtimeWatcher?.close();
    await removeElectronDevClientState(paths);
    await rm(paths.shellRequestFile, { force: true });
    await logger.close();
  }
}

export async function runMacosElectronDevSupervisor(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') throw new Error('macOS Electron daily debug requires a darwin host');
  const paths = options.paths ?? resolveMacosElectronDevPaths(options.cwd);
  const existing = readElectronDevSnapshot(paths, options.isAlive ?? processIsAlive);
  if (existing.supervisorAlive) throw new Error(`macOS Electron daily debug already running pid=${existing.client.supervisorPid}`);
  (options.maintain ?? maintainBeforeProduction)({ rootDir: paths.appRoot });
  await (options.prepareSignature ?? prepareMacosElectronDevSignature)({
    appRoot: paths.appRoot,
    platform
  });
  const dailyEnv = createMacosDailyEnvironment({
    env: options.env ?? process.env,
    homeDir: options.homeDir,
    libraryHome: options.libraryHome ?? MACOS_DAILY_LIBRARY_HOME,
    paths,
    platform
  });
  let requestStop = async () => undefined;
  let sessionDone = Promise.resolve(0);
  return withResourceGate({
    className: 'preview',
    commandLabel: 'macOS Electron daily debug',
    fn: (gateEnv) => {
      sessionDone = runSupervisorSession({
        env: { ...gateEnv, ...dailyEnv },
        paths,
        registerStop: (handler) => { requestStop = handler; },
        startupTimeoutMs: options.startupTimeoutMs ?? 60000
      });
      return sessionDone;
    },
    onSignal: async () => {
      await requestStop();
      await sessionDone;
    },
    repoRoot: paths.appRoot
  });
}
