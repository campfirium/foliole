/* global process, setTimeout */

import fs from 'node:fs';
import path from 'node:path';

import { writeRendererReloadIntent } from './write-renderer-reload-intent.mjs';

const READY_MARKER_FILE = '.windows-native-boot-ready.json';
const BRIDGE_READY_MARKER_FILE = '.windows-native-bridge-ready.json';
const RENDERER_RELOAD_DELIVERY_FILE = '.windows-dev-renderer-reload-delivered.json';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function markerPath(repoRoot, name) {
  return path.join(repoRoot, name);
}

export function resetReadyMarkers(repoRoot) {
  for (const name of [READY_MARKER_FILE, BRIDGE_READY_MARKER_FILE]) {
    fs.rmSync(markerPath(repoRoot, name), { force: true });
  }
}

export function readMarker(repoRoot, name) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(repoRoot, name), 'utf8'));
  } catch {
    return null;
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function markerMatches(marker, expectedStage, expectedSession, expectedPid) {
  return Boolean(
    marker &&
    marker.stage === expectedStage &&
    marker.session === expectedSession &&
    marker.pid === expectedPid
  );
}

export function readyMarkersMatch(appReady, bridgeReady, expectedSession) {
  return Boolean(
    appReady &&
    bridgeReady &&
    appReady.stage === 'app_ready' &&
    bridgeReady.stage === 'bridge_ready' &&
    appReady.session === expectedSession &&
    bridgeReady.session === expectedSession &&
    appReady.pid === bridgeReady.pid
  );
}

export async function waitForReadyMarkers(input) {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const appReady = readMarker(input.repoRoot, READY_MARKER_FILE);
    const bridgeReady = readMarker(input.repoRoot, BRIDGE_READY_MARKER_FILE);
    if (readyMarkersMatch(appReady, bridgeReady, input.session)) {
      return { appReady, bridgeReady };
    }
    if (input.electron.exitCode !== null) {
      throw new Error(`electron exited before ready markers code=${input.electron.exitCode}`);
    }
    await wait(500);
  }
  throw new Error(`ready markers timed out pid=${input.pid} session=${input.session}`);
}

async function waitForRendererReloadDelivery(repoRoot, expectedNonce, timeoutMs) {
  const deliveryPath = path.join(repoRoot, RENDERER_RELOAD_DELIVERY_FILE);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const delivery = readJsonFile(deliveryPath);
    if (delivery?.nonce === expectedNonce) {
      return delivery;
    }
    await wait(250);
  }
  throw new Error(`renderer reload delivery timed out nonce=${expectedNonce}`);
}

export async function verifyRendererReload(input) {
  fs.rmSync(path.join(input.repoRoot, RENDERER_RELOAD_DELIVERY_FILE), { force: true });
  const result = await writeRendererReloadIntent({
    head: process.env.FOLIOLE_RUNTIME_HEAD ?? '',
    reason: 'windows-native-health-check',
    requestedBy: 'windows-native-health-check',
    rootDir: input.repoRoot
  });
  await waitForRendererReloadDelivery(input.repoRoot, result.intent.nonce, input.timeoutMs);
  return result.intent.nonce;
}
