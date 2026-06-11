import fs from 'node:fs';
import path from 'node:path';

import { ensureBaselineExists, resetSlotFromBaseline } from './slotBaseline.mjs';
import {
  compileElectronInSlot,
  runSlotClientUntilReady,
  slotStatus
} from './slotClient.mjs';
import { ensureSlotLibraryExists } from './slotLibrary.mjs';
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
  ensureDir(path.dirname(path.join(p.repo, p.windowsSyncStamp)));
  fs.closeSync(fs.openSync(path.join(p.repo, p.windowsSyncStamp), 'a'));
  writeState(slot, {
    baselineHead: state.baselineHead || gitHead(p.repo),
    lastPreparedAt: new Date().toISOString(),
    touchedFiles: files
  });
  console.log(`[preview-slot] prepared slot=${slot} files=${files.length}`);
}

export async function preview(slot, reset) {
  ensureSlotLibraryExists(slot);
  prepare(slot, reset);
  const state = readState(slot);
  const touchedFiles = state.touchedFiles.map(normalizeRelPath);
  const requiresShellRestart = hasMatchingFile(touchedFiles, isShellConfigFile);
  const requiresRuntimeRestart = requiresShellRestart || hasMatchingFile(touchedFiles, isRuntimeFile);
  if (requiresRuntimeRestart) compileElectronInSlot(slot);
  const running = slotStatus(slot).running;
  const action = running ? (requiresShellRestart ? 'full-restart' : (requiresRuntimeRestart ? 'restart' : 'status')) : 'start';
  if (running && action === 'status') {
    console.log(`[preview-slot] status: RUNNING slot=${slot} update=hmr-or-existing-vite-watch`);
  } else {
    await runSlotClientUntilReady(slot, action, {
      WINDOWS_NATIVE_PREFLIGHT_STAMP_FILE: path.join('.lab', 'internal', 'runtime', 'preview-slots', slot, 'preflight.json')
    });
  }
  writeState(slot, { lastPreviewAt: new Date().toISOString() });
  console.log(`[preview-slot] preview finished slot=${slot} action=${action} files=${touchedFiles.length}`);
}
