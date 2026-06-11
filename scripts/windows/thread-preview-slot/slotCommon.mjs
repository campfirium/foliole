import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const STATE_VERSION = 1;
export const DEFAULT_ROOT = '/mnt/d/C/foliole-preview';
export const DEFAULT_MAIN_MIRROR = '/mnt/d/C/foliole';
export const DEFAULT_LIBRARY_SOURCE = '/mnt/d/X/U/Foliole';

export function repoRoot() {
  return path.resolve(process.env.FOLIOLE_REPO_ROOT || process.cwd());
}

export function previewRoot() {
  return process.env.FOLIOLE_PREVIEW_SLOT_ROOT || DEFAULT_ROOT;
}

export function mainMirror() {
  return process.env.FOLIOLE_WINDOWS_MAIN_MIRROR || DEFAULT_MAIN_MIRROR;
}

export function paths(slot) {
  const root = previewRoot();
  const repo = repoRoot();
  const runtimeDir = path.join(repo, '.lab', 'internal', 'runtime', 'preview-slots', slot);
  const slotDir = path.join(root, 'slots', slot);
  return {
    appReadyFile: path.join(slotDir, '.windows-native-boot-ready.json'),
    baselineDir: path.join(root, 'baseline'),
    bridgeReadyFile: path.join(slotDir, '.windows-native-bridge-ready.json'),
    clientStateFile: path.join(slotDir, '.windows-native-client-state.json'),
    libraryDir: path.join(root, 'library', slot),
    mainMirrorDir: mainMirror(),
    repo,
    root,
    runtimeDir,
    slotDir,
    stateFile: path.join(runtimeDir, 'state.json'),
    windowVisibleFile: path.join(slotDir, '.windows-native-window-visible.json'),
    windowsSyncStamp: path.join('.lab', 'internal', 'runtime', 'preview-slots', slot, 'windows-sync.stamp')
  };
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    stdio: options.stdio ?? 'pipe'
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`);
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

export function printResult(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

export function toWindowsPath(wslPath) {
  const match = wslPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/u);
  if (!match) return wslPath;
  return `${match[1].toUpperCase()}:\\${match[2].replaceAll('/', '\\')}`;
}

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function normalizeRelPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//u, '').trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`invalid relative file path: ${filePath}`);
  }
  return normalized;
}

export function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export function readState(slot) {
  return readJson(paths(slot).stateFile, {
    baselineHead: '',
    createdAt: '',
    lastPreparedAt: '',
    lastPreviewAt: '',
    slot,
    touchedFiles: [],
    version: STATE_VERSION
  });
}

export function writeState(slot, patch) {
  const current = readState(slot);
  const next = {
    ...current,
    ...patch,
    slot,
    touchedFiles: uniqueSorted(patch.touchedFiles ?? current.touchedFiles ?? []),
    version: STATE_VERSION
  };
  writeJson(paths(slot).stateFile, next);
  return next;
}

export function gitHead(repo) {
  return run('git', ['rev-parse', 'HEAD'], { cwd: repo });
}

export function gitCurrentBranch(repo) {
  return run('git', ['branch', '--show-current'], { cwd: repo });
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
