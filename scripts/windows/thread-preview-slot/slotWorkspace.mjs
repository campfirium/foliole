/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { ensureBaselineExists, resetSlotFromBaseline } from './slotBaseline.mjs';
import { bindSlot } from './slotBinding.mjs';
import {
  ensureElectronDistInSlot,
  runSlotClientUntilReady,
  slotStatus
} from './slotClient.mjs';
import { syncMissingLocalDependencies } from './slotDependencies.mjs';
import { ensureSlotLibraryExists } from './slotLibrary.mjs';
import { acquireSlotPort } from './slotPorts.mjs';
import {
  ensureDir,
  gitHead,
  normalizeRelPath,
  paths,
  readState,
  uniqueSorted,
  writeState
} from './slotCommon.mjs';

function overlayFiles(slot, files) {
  const p = paths(slot);
  const normalized = uniqueSorted(files.map(normalizeRelPath));
  for (const file of normalized) {
    const source = path.join(p.repo, file);
    const target = path.join(p.slotDir, file);
    if (fs.existsSync(source) && fs.statSync(source).isFile()) {
      ensureDir(path.dirname(target));
      fs.copyFileSync(source, target);
      fs.utimesSync(target, new Date(), new Date());
      continue;
    }
    fs.rmSync(target, { force: true, recursive: true });
  }
  return normalized;
}

function hasMatchingFile(files, predicate) {
  return files.some((file) => predicate(normalizeRelPath(file)));
}

function isRuntimeFile(file) {
  if (!/^(electron|lib\/core|lib\/platform)\//u.test(file)) return false;
  if (/\.(test|spec)\.(ts|tsx|mjs|js)$/u.test(file)) return false;
  return true;
}

function isShellConfigFile(file) {
  return /^(tailwind\.config\.(js|cjs|mjs|ts)|postcss\.config\.(js|cjs|mjs|ts)|vite\.config\.(js|cjs|mjs|ts)|vite\.shared\.ts|package\.json|package-lock\.json|scripts\/electron-dev\.mjs|scripts\/electron-dev-server\.mjs|scripts\/windows\/electron-dev-native\.mjs)$/u.test(file);
}

export function resolvePreviewClientAction({ labelChanged, requiresRuntimeRestart, requiresShellRestart, running }) {
  if (!running) return 'start';
  if (requiresShellRestart || labelChanged) return 'full-restart';
  if (requiresRuntimeRestart) return 'restart';
  return 'status';
}

export function record(slot, files) {
  if (files.length === 0) {
    throw new Error('record requires at least one --file');
  }
  const current = readState(slot);
  const touchedFiles = uniqueSorted([...current.touchedFiles, ...files.map(normalizeRelPath)]);
  const state = writeState(slot, {
    baselineHead: current.baselineHead || gitHead(paths(slot).repo),
    createdAt: current.createdAt || new Date().toISOString(),
    touchedFiles
  });
  console.log(`[preview-slot] recorded files=${state.touchedFiles.length} slot=${slot}`);
  for (const file of state.touchedFiles) console.log(file);
}

export function prepare(slot, reset) {
  const state = readState(slot);
  const p = paths(slot);
  ensureBaselineExists(slot);
  if ((state.touchedFiles ?? []).length === 0) {
    throw new Error('no touched files recorded for this slot; run record --file <path> before prepare/preview');
  }
  if (reset || !fs.existsSync(path.join(p.slotDir, 'package.json'))) {
    resetSlotFromBaseline(slot);
  }
  const files = overlayFiles(slot, state.touchedFiles);
  const dependencyFiles = syncMissingLocalDependencies(slot, files);
  ensureDir(path.dirname(path.join(p.repo, p.windowsSyncStamp)));
  fs.closeSync(fs.openSync(path.join(p.repo, p.windowsSyncStamp), 'a'));
  writeState(slot, {
    baselineHead: state.baselineHead || gitHead(p.repo),
    lastPreparedAt: new Date().toISOString(),
    previewDependencies: dependencyFiles,
    touchedFiles: files
  });
  console.log(`[preview-slot] prepared slot=${slot} files=${files.length} previewDependencies=${dependencyFiles.length}`);
}

export async function preview(slot, { label = '', reset = false, thread = '' } = {}) {
  ensureSlotLibraryExists(slot);
  const previousState = readState(slot);
  const binding = bindSlot(slot, { label, thread });
  const port = await acquireSlotPort(slot, binding);
  prepare(slot, reset);
  const state = readState(slot);
  const touchedFiles = state.touchedFiles.map(normalizeRelPath);
  const previewDependencies = (state.previewDependencies ?? []).map(normalizeRelPath);
  const runtimeFiles = uniqueSorted([...touchedFiles, ...previewDependencies]);
  const labelChanged = (previousState.label || '') !== (binding.label || '');
  const requiresShellRestart = hasMatchingFile(touchedFiles, isShellConfigFile);
  const requiresRuntimeRestart = requiresShellRestart || hasMatchingFile(runtimeFiles, isRuntimeFile);
  ensureElectronDistInSlot(slot, { requiresRuntimeRestart });
  const running = slotStatus(slot).running;
  const action = resolvePreviewClientAction({ labelChanged, requiresRuntimeRestart, requiresShellRestart, running });
  if (running && action === 'status') {
    console.log(`[preview-slot] status: RUNNING slot=${slot} update=hmr-or-existing-vite-watch`);
  } else {
    await runSlotClientUntilReady(slot, action, {
      FOLIOLE_PREVIEW_LABEL: binding.label,
      FOLIOLE_VITE_PORT: String(port),
      FOLIOLE_VITE_PORT_STRICT: '1',
      WINDOWS_NATIVE_PREFLIGHT_STAMP_FILE: path.join('.lab', 'internal', 'runtime', 'preview-slots', slot, 'preflight.json')
    });
  }
  writeState(slot, { lastPreviewAt: new Date().toISOString(), port });
  console.log(`[preview-slot] preview finished slot=${slot} action=${action} files=${touchedFiles.length} previewDependencies=${previewDependencies.length}`);
}
