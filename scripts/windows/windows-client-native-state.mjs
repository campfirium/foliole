/* global process */

import fs from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readBootEvents(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/u).filter(Boolean);
  } catch {
    return [];
  }
}

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readClientState(stateFile) {
  return readJson(stateFile);
}

export function readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile }) {
  const appReady = readJson(appReadyFile);
  const bridgeReady = readJson(bridgeReadyFile);
  const windowVisible = readJson(windowVisibleFile);
  return resolveTrustedReadyState({ appReady, bridgeReady, windowVisible });
}

function resolveTrustedReadyState({ appReady, bridgeReady, windowVisible }) {
  if (
    appReady?.stage === 'app_ready' &&
    bridgeReady?.stage === 'bridge_ready' &&
    windowVisible?.stage === 'window_visible' &&
    appReady.session &&
    appReady.session === bridgeReady.session &&
    appReady.session === windowVisible.session &&
    bridgeReady.payload?.bridgeAvailable === true &&
    windowVisible.payload?.isVisible === true &&
    processAlive(appReady.pid) &&
    processAlive(bridgeReady.pid) &&
    processAlive(windowVisible.pid)
  ) {
    return { appReady, bridgeReady, windowVisible };
  }
  return null;
}

function parseBootEvent(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function readReadyStateFromBootEvents(eventLogFile, options = {}) {
  if (Object.hasOwn(options, 'session') && !options.session) {
    return null;
  }
  const bySession = new Map();
  const lines = readBootEvents(eventLogFile);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const event = parseBootEvent(lines[index]);
    if (!event?.session || typeof event.stage !== 'string') {
      continue;
    }
    if (options.session && event.session !== options.session) {
      continue;
    }
    const entry = bySession.get(event.session) ?? {};
    if (event.stage === 'app_ready' && !entry.appReady) entry.appReady = event;
    if (event.stage === 'bridge_ready' && !entry.bridgeReady) entry.bridgeReady = event;
    if (event.stage === 'window_visible' && !entry.windowVisible) entry.windowVisible = event;
    bySession.set(event.session, entry);
    const ready = resolveTrustedReadyState(entry);
    if (ready) {
      return ready;
    }
  }
  return null;
}

export async function removeClientState(stateFile) {
  await rm(stateFile, { force: true });
}

export async function resetReadyMarkers({ appReadyFile, bridgeReadyFile, windowVisibleFile }) {
  await Promise.all([
    rm(appReadyFile, { force: true }),
    rm(bridgeReadyFile, { force: true }),
    rm(windowVisibleFile, { force: true })
  ]);
}

export async function saveClientState(stateFile, state) {
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
