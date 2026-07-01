/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readReadyState } from './windows-client-native-state.mjs';
import { normalizeSpawnCommand } from '../lib/windows-spawn-command.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const MARKER_FILES = [
  '.windows-native-boot-ready.json',
  '.windows-native-bridge-ready.json',
  '.windows-native-window-visible.json'
];
const MAIN_DATABASE_PATH = 'D:\\X\\U\\Foliole\\Data\\foliole.db';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function readMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function markerSnapshots(root) {
  return Object.fromEntries(
    MARKER_FILES.map((name) => [name, readText(path.join(root, name))])
  );
}

function snapshotsMatch(before, after) {
  return MARKER_FILES.every((name) => before[name] === after[name]);
}

export function readHumanPreviewSnapshot(paths = resolveWindowsNativePaths()) {
  const ready = readReadyState({
    appReadyFile: paths.appReadyFile,
    bridgeReadyFile: paths.bridgeReadyFile,
    windowVisibleFile: paths.windowVisibleFile
  });
  return {
    markers: markerSnapshots(paths.repoRoot),
    ready,
    state: readJson(paths.stateFile)
  };
}

export function readHiddenMarkerSnapshot(stateRoot) {
  const markers = markerSnapshots(stateRoot);
  const appReady = readJson(path.join(stateRoot, '.windows-native-boot-ready.json'));
  const bridgeReady = readJson(path.join(stateRoot, '.windows-native-bridge-ready.json'));
  const windowVisible = readJson(path.join(stateRoot, '.windows-native-window-visible.json'));
  return { appReady, bridgeReady, markers, windowVisible };
}

export function verifyNonInterference({ after, before, hidden }) {
  if (!before.ready) {
    throw new Error('human preview is not trusted before hidden gate');
  }
  if (!after.ready) {
    throw new Error('human preview is not trusted after hidden gate');
  }
  if (!snapshotsMatch(before.markers, after.markers)) {
    throw new Error('human preview ready markers changed during hidden gate');
  }
  const humanPid = before.ready.windowVisible.pid;
  const hiddenPid = hidden.windowVisible?.pid;
  if (!Number.isInteger(hiddenPid)) {
    throw new Error('hidden gate did not write a window-visible marker in its state root');
  }
  if (hiddenPid === humanPid) {
    throw new Error(`hidden gate reused the human preview runtime pid=${hiddenPid}`);
  }
  if (hidden.appReady?.session !== hidden.bridgeReady?.session || hidden.appReady?.session !== hidden.windowVisible?.session) {
    throw new Error('hidden gate markers do not share one boot session');
  }
  if (before.mainDatabaseMtimeMs !== after.mainDatabaseMtimeMs) {
    throw new Error('main database mtime changed during hidden gate');
  }
  return {
    mainDatabaseMtimeMs: after.mainDatabaseMtimeMs,
    hiddenPid,
    hiddenSession: hidden.windowVisible.session,
    humanPid,
    humanSession: before.ready.windowVisible.session
  };
}

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runHiddenGate({ repoRoot, stateRoot }) {
  return new Promise((resolve) => {
    const normalizedCommand = normalizeSpawnCommand([npmBin(), 'run', 'test:e2e:desktop:native:hidden']);
    const child = spawn(normalizedCommand.bin, normalizedCommand.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      },
      shell: false,
      stdio: 'inherit'
    });
    child.on('error', () => resolve(1));
    child.on('close', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

export async function runNonInterferenceProof({
  paths = resolveWindowsNativePaths(),
  mainDatabasePath = process.env.FOLIOLE_MAIN_DATABASE_PATH?.trim() || MAIN_DATABASE_PATH,
  stateRoot = path.join(paths.repoRoot, '.tmp', 'hidden-native-noninterference')
} = {}) {
  const before = readHumanPreviewSnapshot(paths);
  before.mainDatabaseMtimeMs = readMtimeMs(mainDatabasePath);
  if (!before.ready) {
    throw new Error('human preview must be trusted RUNNING before proof');
  }
  fs.rmSync(stateRoot, { force: true, recursive: true });
  fs.mkdirSync(stateRoot, { recursive: true });
  const code = await runHiddenGate({ repoRoot: paths.repoRoot, stateRoot });
  if (code !== 0) {
    throw new Error(`hidden native gate failed code=${code}`);
  }
  const after = readHumanPreviewSnapshot(paths);
  after.mainDatabaseMtimeMs = readMtimeMs(mainDatabasePath);
  const hidden = readHiddenMarkerSnapshot(stateRoot);
  return {
    ...verifyNonInterference({ after, before, hidden }),
    stateRoot
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runNonInterferenceProof()
    .then((result) => {
      console.log(
        `[hidden-native-noninterference] ok human_pid=${result.humanPid} hidden_pid=${result.hiddenPid} state_root=${result.stateRoot}`
      );
    })
    .catch((error) => {
      console.error(`[hidden-native-noninterference] failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
