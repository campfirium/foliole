import { readFile } from 'node:fs/promises';

import { writeRestartIntent } from './write-restart-intent.mjs';
import { processAlive } from './windows-client-native-state.mjs';

async function readDeliveryNonce(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')).nonce;
  } catch {
    return null;
  }
}

async function waitForRestartDelivery({ deliveryFile, nonce, timeoutMs, wait }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await readDeliveryNonce(deliveryFile) === nonce) {
      return true;
    }
    await wait(500);
  }
  return false;
}

async function waitForProcessExit({ pid, timeoutMs, wait }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      return true;
    }
    await wait(500);
  }
  return !processAlive(pid);
}

async function waitForShellAndRuntimeExit({ runtimePid, shellPid, timeoutMs, wait }) {
  if (shellPid && !await waitForProcessExit({ pid: shellPid, timeoutMs, wait })) {
    return false;
  }
  if (!runtimePid) {
    return true;
  }
  return waitForProcessExit({ pid: runtimePid, timeoutMs, wait });
}

export async function requestCooperativeFullRestart({
  currentHead,
  readClientState,
  removeClientState,
  resetMarkers,
  restartDeliveryFile,
  repoRoot,
  startClient,
  timeoutMs,
  wait
}) {
  const state = readClientState();
  if (!state?.shellPid && !state?.runtimePid) {
    return null;
  }
  const result = await writeRestartIntent({
    head: currentHead,
    reason: 'full shell restart requested',
    requestedBy: 'windows-native-client',
    rootDir: repoRoot,
    shellAction: 'exit-shell'
  });
  if (!await waitForRestartDelivery({ deliveryFile: restartDeliveryFile, nonce: result.intent.nonce, timeoutMs, wait })) {
    return null;
  }
  if (!await waitForShellAndRuntimeExit({
    runtimePid: state.runtimePid,
    shellPid: state.shellPid,
    timeoutMs,
    wait
  })) {
    return null;
  }
  await removeClientState();
  await resetMarkers();
  return startClient({ print: false });
}
