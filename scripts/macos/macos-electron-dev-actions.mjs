/* global process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { readFile, rm } from 'node:fs/promises';

import {
  processIsAlive,
  readJson,
  readElectronDevSnapshot,
  waitForElectronDevCondition
} from '../desktop/electron-dev-control-state.mjs';
import { writeElectronDevShellRequest } from '../desktop/electron-dev-shell-request.mjs';
import { createDesktopIsolationContext } from '../desktop/playwright-desktop-isolation.mjs';

function requireRunningSnapshot(paths, isAlive = processIsAlive) {
  const snapshot = readElectronDevSnapshot(paths, isAlive);
  if (!snapshot.running) throw new Error('macOS Electron daily debug runtime is not healthy');
  return snapshot;
}

export function formatMacosElectronDevStatus(snapshot) {
  const status = snapshot.running ? 'RUNNING' : snapshot.supervisorAlive ? 'UNHEALTHY' : 'STOPPED';
  return [
    `[macos-electron-dev] status: ${status}`,
    `supervisor_pid=${snapshot.client?.supervisorPid ?? 'none'}`,
    `shell_pid=${snapshot.client?.shellPid ?? 'none'}`,
    `runtime_pid=${snapshot.ready?.appReady.pid ?? 'none'}`,
    `session=${snapshot.ready?.appReady.session ?? 'none'}`
  ].join(' ');
}

export async function requestMacosElectronRuntimeRestart({
  isAlive = processIsAlive,
  paths,
  reason = 'macOS daily debug runtime restart',
  timeoutMs = 45000,
  uuid,
  waitForCondition = waitForElectronDevCondition
}) {
  const before = requireRunningSnapshot(paths, isAlive);
  const previousSession = before.ready.appReady.session;
  const bootSession = `macos-daily-${uuid?.() ?? randomUUID()}`;
  const request = await writeElectronDevShellRequest({
    bootSession,
    filePath: paths.shellRequestFile,
    reason,
    runtimeHead: before.ready.appReady.head ?? null
  });
  try {
    return await waitForCondition({
      evaluate: () => {
        const snapshot = readElectronDevSnapshot(paths, isAlive);
        return snapshot.running && snapshot.ready.appReady.session !== previousSession ? snapshot : null;
      },
      label: 'macOS Electron runtime restart',
      stateRoot: paths.dailyRoot,
      timeoutMs
    });
  } catch (error) {
    if (readJson(paths.shellRequestFile)?.id === request.id) {
      await rm(paths.shellRequestFile, { force: true });
    }
    throw error;
  }
}

export function requestMacosElectronShellExit({ paths, reason }) {
  return writeElectronDevShellRequest({
    filePath: paths.shellRequestFile,
    reason,
    shellAction: 'exit-shell'
  });
}

export async function requestMacosElectronFullRestart({
  isAlive = processIsAlive,
  paths,
  timeoutMs = 60000,
  waitForCondition = waitForElectronDevCondition
}) {
  const before = requireRunningSnapshot(paths, isAlive);
  const previousSession = before.ready.appReady.session;
  const previousShellPid = before.client.shellPid;
  const previousControlId = before.client.lastControl?.id ?? null;
  process.kill(before.client.supervisorPid, 'SIGHUP');
  return waitForCondition({
    evaluate: () => {
      const snapshot = readElectronDevSnapshot(paths, isAlive);
      if (
        snapshot.client?.lastControl?.id !== previousControlId &&
        snapshot.client?.lastControl?.status === 'compile-failed'
      ) {
        throw new Error('macOS Electron full restart compile failed; old shell preserved');
      }
      return snapshot.running &&
        snapshot.client.shellPid !== previousShellPid &&
        snapshot.ready.appReady.session !== previousSession ? snapshot : null;
    },
    label: 'macOS Electron full restart',
    stateRoot: paths.dailyRoot,
    timeoutMs
  });
}

export async function stopMacosElectronDev({
  isAlive = processIsAlive,
  paths,
  timeoutMs = 15000,
  waitForCondition = waitForElectronDevCondition
}) {
  const snapshot = readElectronDevSnapshot(paths, isAlive);
  if (!snapshot.supervisorAlive) return false;
  process.kill(snapshot.client.supervisorPid, 'SIGTERM');
  await waitForCondition({
    evaluate: () => !fs.existsSync(paths.clientStateFile),
    label: 'macOS Electron daily debug stop',
    stateRoot: paths.dailyRoot,
    timeoutMs
  });
  return true;
}

export async function resetMacosElectronDev({ env = process.env, homeDir, paths, platform = process.platform }) {
  const snapshot = readElectronDevSnapshot(paths);
  if (snapshot.supervisorAlive) throw new Error('stop macOS Electron daily debug before reset');
  createDesktopIsolationContext({
    ...env,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: paths.dailyRoot
  }, { homeDir, platform });
  await rm(paths.dailyRoot, { force: true, recursive: true });
}

export function assertMacosResetPreviewAvailable(paths, isAlive = processIsAlive) {
  const snapshot = readElectronDevSnapshot(paths, isAlive);
  if (snapshot.supervisorAlive) {
    throw new Error('stop macOS Electron daily debug before starting reset preview');
  }
}

export async function readMacosElectronDevLogs(paths, maxLines = 120) {
  const raw = await readFile(paths.dailyLogFile, 'utf8').catch(() => '');
  const tail = raw.split(/\r?\n/u).filter(Boolean).slice(-maxLines).join('\n');
  return [
    `[macos-electron-dev] daily_log=${paths.dailyLogFile}`,
    `[macos-electron-dev] boot_log=${paths.bootEventLogFile}`,
    tail
  ].filter(Boolean).join('\n');
}
