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
const VISIBLE_PRESENTATION_SPEC = 'tests/desktop/visible-native-presentation.spec.ts';

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
  return Object.fromEntries(MARKER_FILES.map((name) => [name, readText(path.join(root, name))]));
}

function snapshotsMatch(before, after) {
  return MARKER_FILES.every((name) => before[name] === after[name]);
}

function readHumanPreviewSnapshot(paths) {
  return {
    markers: markerSnapshots(paths.repoRoot),
    ready: readReadyState({
      appReadyFile: paths.appReadyFile,
      bridgeReadyFile: paths.bridgeReadyFile,
      windowVisibleFile: paths.windowVisibleFile
    })
  };
}

function readVisibleMarkerSnapshot(stateRoot) {
  return {
    appReady: readJson(path.join(stateRoot, '.windows-native-boot-ready.json')),
    bridgeReady: readJson(path.join(stateRoot, '.windows-native-bridge-ready.json')),
    windowVisible: readJson(path.join(stateRoot, '.windows-native-window-visible.json'))
  };
}

export function verifyVisibleIsolation({ after, before, visible }) {
  const visiblePid = visible.windowVisible?.pid;
  if (!Number.isInteger(visiblePid)) {
    throw new Error('visible gate did not write a window-visible marker in its state root');
  }
  if (visible.appReady?.session !== visible.bridgeReady?.session || visible.appReady?.session !== visible.windowVisible?.session) {
    throw new Error('visible gate markers do not share one boot session');
  }
  if (before.mainDatabaseMtimeMs !== after.mainDatabaseMtimeMs) {
    throw new Error('main database mtime changed during visible gate');
  }
  if (before.ready && !snapshotsMatch(before.markers, after.markers)) {
    throw new Error('human preview ready markers changed during visible gate');
  }
  const humanPid = before.ready?.windowVisible?.pid;
  if (Number.isInteger(humanPid) && humanPid === visiblePid) {
    throw new Error(`visible gate reused the human preview runtime pid=${visiblePid}`);
  }
  return {
    humanPid: Number.isInteger(humanPid) ? humanPid : null,
    mainDatabaseMtimeMs: after.mainDatabaseMtimeMs,
    visiblePid,
    visibleSession: visible.windowVisible.session
  };
}

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runVisibleGate({ repoRoot, stateRoot }) {
  return new Promise((resolve) => {
    const normalizedCommand = normalizeSpawnCommand([
      npmBin(),
      'run',
      'test:e2e:desktop:native:visible',
      '--',
      VISIBLE_PRESENTATION_SPEC
    ]);
    const child = spawn(normalizedCommand.bin, normalizedCommand.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      },
      shell: false,
      stdio: 'inherit'
    });
    child.on('error', () => resolve(1));
    child.on('close', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

export async function runVisibleIsolationProof({
  paths = resolveWindowsNativePaths(),
  mainDatabasePath = process.env.FOLIOLE_MAIN_DATABASE_PATH?.trim() || MAIN_DATABASE_PATH,
  stateRoot = path.join(paths.repoRoot, '.tmp', 'visible-native-isolation')
} = {}) {
  const before = readHumanPreviewSnapshot(paths);
  before.mainDatabaseMtimeMs = readMtimeMs(mainDatabasePath);
  fs.rmSync(stateRoot, { force: true, recursive: true });
  fs.mkdirSync(stateRoot, { recursive: true });
  const code = await runVisibleGate({ repoRoot: paths.repoRoot, stateRoot });
  if (code !== 0) {
    throw new Error(`visible native gate failed code=${code}`);
  }
  const after = readHumanPreviewSnapshot(paths);
  after.mainDatabaseMtimeMs = readMtimeMs(mainDatabasePath);
  return {
    ...verifyVisibleIsolation({ after, before, visible: readVisibleMarkerSnapshot(stateRoot) }),
    stateRoot
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runVisibleIsolationProof()
    .then((result) => {
      console.log(
        `[visible-native-isolation] ok visible_pid=${result.visiblePid} human_pid=${result.humanPid ?? 'none'} state_root=${result.stateRoot}`
      );
    })
    .catch((error) => {
      console.error(`[visible-native-isolation] failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
