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

export function readReadyState({ appReadyFile, bridgeReadyFile }) {
  const appReady = readJson(appReadyFile);
  const bridgeReady = readJson(bridgeReadyFile);
  if (
    appReady?.stage === 'app_ready' &&
    bridgeReady?.stage === 'bridge_ready' &&
    appReady.session &&
    appReady.session === bridgeReady.session &&
    appReady.pid === bridgeReady.pid &&
    bridgeReady.payload?.bridgeAvailable === true &&
    processAlive(appReady.pid)
  ) {
    return { appReady, bridgeReady };
  }
  return null;
}

export async function removeClientState(stateFile) {
  await rm(stateFile, { force: true });
}

export async function resetReadyMarkers({ appReadyFile, bridgeReadyFile }) {
  await Promise.all([
    rm(appReadyFile, { force: true }),
    rm(bridgeReadyFile, { force: true })
  ]);
}

export async function saveClientState(stateFile, state) {
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
