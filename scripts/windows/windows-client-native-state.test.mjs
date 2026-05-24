// @vitest-environment node

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { readReadyState, readReadyStateFromBootEvents } from './windows-client-native-state.mjs';

it('treats stale ready markers with a dead runtime pid as not running', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-test-${Date.now()}`);
  const appReadyFile = path.join(tempDir, 'app-ready.json');
  const bridgeReadyFile = path.join(tempDir, 'bridge-ready.json');
  const windowVisibleFile = path.join(tempDir, 'window-visible.json');
  const deadPid = 2147483647;

  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(appReadyFile, JSON.stringify({
      pid: deadPid,
      session: 'stale-session',
      stage: 'app_ready'
    }), 'utf8');
    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid: deadPid,
      session: 'stale-session',
      stage: 'bridge_ready'
    }), 'utf8');
    await writeFile(windowVisibleFile, JSON.stringify({
      payload: { isVisible: true },
      pid: deadPid,
      session: 'stale-session',
      stage: 'window_visible'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

it('accepts renderer and main-process markers for the same native session', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-window-test-${Date.now()}`);
  const appReadyFile = path.join(tempDir, 'app-ready.json');
  const bridgeReadyFile = path.join(tempDir, 'bridge-ready.json');
  const windowVisibleFile = path.join(tempDir, 'window-visible.json');
  const main = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
    windowsHide: true
  });
  const pid = process.pid;
  const mainPid = main.pid;

  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(appReadyFile, JSON.stringify({ pid, session: 'same-session', stage: 'app_ready' }), 'utf8');
    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid,
      session: 'same-session',
      stage: 'bridge_ready'
    }), 'utf8');

    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();
    await writeFile(windowVisibleFile, JSON.stringify({
      payload: { isVisible: true },
      pid: mainPid,
      session: 'same-session',
      stage: 'window_visible'
    }), 'utf8');
    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })?.windowVisible.stage).toBe('window_visible');

    await writeFile(appReadyFile, JSON.stringify({ pid, session: 'other-session', stage: 'app_ready' }), 'utf8');
    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();
    await writeFile(appReadyFile, JSON.stringify({ pid, session: 'same-session', stage: 'app_ready' }), 'utf8');
    await writeFile(bridgeReadyFile, JSON.stringify({
      payload: { bridgeAvailable: true },
      pid,
      session: 'other-session',
      stage: 'bridge_ready'
    }), 'utf8');
    expect(readReadyState({ appReadyFile, bridgeReadyFile, windowVisibleFile })).toBeNull();
  } finally {
    main.kill();
    await rm(tempDir, { force: true, recursive: true });
  }
});

it('recovers trusted ready state from boot events when marker files are missing', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `windows-client-native-events-test-${Date.now()}`);
  const eventLogFile = path.join(tempDir, 'native-boot-events.ndjson');
  const main = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
    windowsHide: true
  });

  await mkdir(tempDir, { recursive: true });
  try {
    const eventBase = { head: 'head-1', pid: main.pid, session: 'session-from-events', source: 'main' };
    await writeFile(eventLogFile, [
      JSON.stringify({ ...eventBase, payload: { isVisible: true }, stage: 'window_visible' }),
      JSON.stringify({ ...eventBase, payload: { bridgeAvailable: true }, source: 'renderer', stage: 'bridge_ready' }),
      JSON.stringify({ ...eventBase, payload: { readyState: 'complete' }, source: 'renderer', stage: 'app_ready' })
    ].join('\n'), 'utf8');

    expect(readReadyStateFromBootEvents(eventLogFile)?.appReady.session).toBe('session-from-events');
    expect(readReadyStateFromBootEvents(eventLogFile, { session: 'session-from-events' })?.appReady.session)
      .toBe('session-from-events');
    expect(readReadyStateFromBootEvents(eventLogFile, { session: 'other-session' })).toBeNull();
    expect(readReadyStateFromBootEvents(eventLogFile, { session: undefined })).toBeNull();
  } finally {
    main.kill();
    await rm(tempDir, { force: true, recursive: true });
  }
});
