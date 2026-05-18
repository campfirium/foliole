/* global console, process */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_PREVIEW_QUIET_MS = 3 * 60_000;

function requestPath(runtimeDir, target) {
  return path.join(runtimeDir, `${target}-preview.request.json`);
}

export function readQuietMs(target, env = process.env) {
  const key = `PREVIEW_DEDUPE_${target.toUpperCase()}_QUIET_MS`;
  const rawValue = env[key] ?? env.PREVIEW_DEDUPE_QUIET_MS;
  if (rawValue !== undefined) {
    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
    return parsedValue;
  }
  return DEFAULT_PREVIEW_QUIET_MS;
}

async function writePreviewRequest(runtimeDir, target, request) {
  await mkdir(runtimeDir, { recursive: true });
  const finalPath = requestPath(runtimeDir, target);
  const tempPath = `${finalPath}.${request.id}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(request)}\n`, 'utf8');
  await rename(tempPath, finalPath);
}

async function readPreviewRequest(runtimeDir, target) {
  try {
    return JSON.parse(await readFile(requestPath(runtimeDir, target), 'utf8'));
  } catch {
    return null;
  }
}

export async function waitForQuietPreviewRequest({ currentHash, runtimeDir, target }) {
  const quietMs = readQuietMs(target);
  if (quietMs === 0) {
    return true;
  }

  const request = {
    hash: currentHash,
    id: randomUUID(),
    requestedAt: Date.now()
  };
  await writePreviewRequest(runtimeDir, target, request);
  console.log(`[${target}-preview] debounce: waiting quietMs=${quietMs}`);
  await delay(quietMs);

  const latestRequest = await readPreviewRequest(runtimeDir, target);
  if (latestRequest?.id !== request.id) {
    console.log(`[${target}-preview] debounce: superseded`);
    console.log(`[${target}-preview] status: QUEUED`);
    return false;
  }
  console.log(`[${target}-preview] debounce: released`);
  return true;
}
