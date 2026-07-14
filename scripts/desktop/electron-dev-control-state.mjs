/* global clearTimeout, process, setTimeout */

import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ELECTRON_DEV_MARKERS = {
  appReady: '.windows-native-boot-ready.json',
  bridgeReady: '.windows-native-bridge-ready.json',
  windowVisible: '.windows-native-window-visible.json'
};

export function resolveElectronDevArtifactPaths(stateRoot) {
  const root = path.resolve(stateRoot);
  return {
    appReadyFile: path.join(root, ELECTRON_DEV_MARKERS.appReady),
    bootEventLogFile: path.join(root, 'logs', 'windows', 'native-boot-events.ndjson'),
    bridgeReadyFile: path.join(root, ELECTRON_DEV_MARKERS.bridgeReady),
    clientStateFile: path.join(root, '.macos-electron-dev-client.json'),
    stateRoot: root,
    windowVisibleFile: path.join(root, ELECTRON_DEV_MARKERS.windowVisible)
  };
}

export function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function resolveTrustedReadyState(markers, isAlive = processIsAlive) {
  const { appReady, bridgeReady, windowVisible } = markers;
  const session = appReady?.session;
  if (
    appReady?.stage !== 'app_ready' ||
    bridgeReady?.stage !== 'bridge_ready' ||
    windowVisible?.stage !== 'window_visible' ||
    !session || session !== bridgeReady.session || session !== windowVisible.session ||
    bridgeReady.payload?.bridgeAvailable !== true ||
    windowVisible.payload?.isVisible !== true ||
    !isAlive(appReady.pid) || !isAlive(bridgeReady.pid) || !isAlive(windowVisible.pid)
  ) {
    return null;
  }
  return { appReady, bridgeReady, windowVisible };
}

export function readElectronDevSnapshot(paths, isAlive = processIsAlive) {
  const client = readJson(paths.clientStateFile);
  const markers = {
    appReady: readJson(paths.appReadyFile),
    bridgeReady: readJson(paths.bridgeReadyFile),
    windowVisible: readJson(paths.windowVisibleFile)
  };
  const ready = resolveTrustedReadyState(markers, isAlive);
  const supervisorAlive = isAlive(client?.supervisorPid);
  const shellAlive = isAlive(client?.shellPid);
  return {
    client,
    markers,
    ready,
    running: Boolean(supervisorAlive && shellAlive && ready),
    shellAlive,
    supervisorAlive
  };
}

export async function writeElectronDevClientState(paths, state) {
  await mkdir(paths.stateRoot, { recursive: true });
  await writeFile(paths.clientStateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function removeElectronDevClientState(paths) {
  await rm(paths.clientStateFile, { force: true });
}

export async function removeElectronDevReadyMarkers(paths) {
  await Promise.all([
    rm(paths.appReadyFile, { force: true }),
    rm(paths.bridgeReadyFile, { force: true }),
    rm(paths.windowVisibleFile, { force: true })
  ]);
}

export function waitForElectronDevCondition({
  evaluate,
  label,
  stateRoot,
  timeoutMs = 30000,
  watch = fs.watch
}) {
  const initial = evaluate();
  if (initial) return Promise.resolve(initial);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let watcher = null;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      watcher?.close();
      if (error) reject(error);
      else resolve(value);
    };
    const check = () => {
      try {
        const value = evaluate();
        if (value) finish(null, value);
      } catch (error) {
        finish(error);
      }
    };
    watcher = watch(stateRoot, check);
    watcher.on?.('error', (error) => finish(error));
    if (settled) {
      watcher.close();
      return;
    }
    timer = setTimeout(
      () => finish(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
}
