import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_LIBRARY_SOURCE,
  ensureDir,
  paths,
  run,
  writeState
} from './slotCommon.mjs';

export function librarySource() {
  return process.env.FOLIOLE_PREVIEW_SLOT_LIBRARY_SOURCE || DEFAULT_LIBRARY_SOURCE;
}

export function slotLibraryDatabase(p) {
  return path.join(p.libraryDir, 'Data', 'foliole.db');
}

export function ensureSlotLibraryExists(slot) {
  const p = paths(slot);
  if (!fs.existsSync(slotLibraryDatabase(p))) {
    throw new Error(`slot library missing: ${p.libraryDir}; run library-refresh --slot ${slot} to copy the real library first (never point the slot at the real library)`);
  }
}

export function refreshLibrary(slot) {
  const p = paths(slot);
  const source = librarySource();
  if (!fs.existsSync(path.join(source, 'Data', 'foliole.db'))) {
    throw new Error(`library source has no database: ${source}/Data/foliole.db; set FOLIOLE_PREVIEW_SLOT_LIBRARY_SOURCE if the real library lives elsewhere`);
  }
  ensureDir(p.libraryDir);
  console.log(`[preview-slot] copying library ${source} -> ${p.libraryDir}`);
  console.log('[preview-slot] note: refresh while the main client is idle to avoid a mid-write database snapshot');
  run('rsync', ['-a', '--delete', `${source}/`, `${p.libraryDir}/`], { stdio: 'inherit' });
  writeState(slot, {
    libraryRefreshedAt: new Date().toISOString(),
    librarySource: source
  });
  console.log(`[preview-slot] library refreshed slot=${slot} path=${p.libraryDir}`);
}
