import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  paths,
  run,
  writeState
} from './slotCommon.mjs';

export function slotLibraryDatabase(p) {
  return path.join(p.libraryDir, 'Data', 'foliole.db');
}

export function ensureSlotLibraryExists(slot) {
  const p = paths(slot);
  ensureDir(p.libraryDir);
  writeState(slot, { libraryMode: fs.existsSync(slotLibraryDatabase(p)) ? 'copied' : 'empty' });
}

export function refreshLibrary(slot, source) {
  const p = paths(slot);
  if (!source?.trim()) {
    throw new Error('library-refresh requires explicit --from <library-path>; the real library is never used by default');
  }
  if (!fs.existsSync(path.join(source, 'Data', 'foliole.db'))) {
    throw new Error(`library source has no database: ${source}/Data/foliole.db`);
  }
  ensureDir(p.libraryDir);
  console.log(`[preview-slot] copying library ${source} -> ${p.libraryDir}`);
  console.log('[preview-slot] note: refresh while the main client is idle to avoid a mid-write database snapshot');
  run('rsync', ['-a', '--delete', `${source}/`, `${p.libraryDir}/`], { stdio: 'inherit' });
  writeState(slot, {
    libraryMode: 'copied',
    libraryRefreshedAt: new Date().toISOString(),
    librarySource: source
  });
  console.log(`[preview-slot] library refreshed slot=${slot} path=${p.libraryDir}`);
}
