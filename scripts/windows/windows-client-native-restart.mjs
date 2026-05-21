/* global setTimeout */

import { readFile } from 'node:fs/promises';

import { writeRestartIntent } from './write-restart-intent.mjs';

export async function readDeliveryNonce(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')).nonce;
  } catch {
    return null;
  }
}

export function isReadyAfterControlledRestart(ready, { expectedHead, previousSession }) {
  const session = ready?.appReady?.session;
  if (!session) {
    return false;
  }
  if (previousSession && session === previousSession) {
    return false;
  }
  const runtimeHead = ready.appReady.head ?? '';
  return !expectedHead || runtimeHead === expectedHead;
}

export function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestControlledRuntimeRestart({
  head,
  reason,
  requestedBy,
  rootDir
}) {
  return writeRestartIntent({
    head,
    reason,
    requestedBy,
    rootDir
  });
}

export async function waitForRestartDelivery({ deliveryFile, nonce, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await readDeliveryNonce(deliveryFile) === nonce) {
      return true;
    }
    await wait(500);
  }
  return false;
}

export async function waitForControlledRuntimeReady({
  expectedHead,
  previousSession,
  readReadyState,
  timeoutMs
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = readReadyState();
    if (isReadyAfterControlledRestart(ready, { expectedHead, previousSession })) {
      return ready;
    }
    await wait(500);
  }
  return null;
}
