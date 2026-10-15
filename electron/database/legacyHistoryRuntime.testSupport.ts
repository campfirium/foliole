import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'vite';

import type * as Migrations from '../../lib/core/database/migrations.js';
import type * as Inventory from '../../lib/core/sync/framedSyncInventoryRead.js';
import type * as Edit from '../../lib/core/sync/localContentEdit.js';
import type * as Apply from '../../lib/core/sync/requestSyncObjectApply.js';
import type * as Snapshot from '../../lib/core/sync/requestSyncSnapshot.js';
import type * as Protocol from '../../lib/platform/syncProtocolContract.js';

/** The actually installed pre-retirement revision, compiled as a test fixture with its own imports. */
export async function legacyHistoryRuntime() {
  const revision = '8258d81a06e603490f5adbc26fe457c9699bcafd';
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/t349-legacy-'));
  const archive = execFileSync('git', ['archive', revision, 'lib'], { maxBuffer: 40 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', root], { input: archive });
  const entry = ['database/migrations', 'sync/framedSyncInventoryRead',
    'sync/requestSyncObjectApply', 'sync/requestSyncSnapshot', 'sync/localContentEdit']
    .map(file => `export * from './lib/core/${file}.ts';`).join('\n') +
    "\nexport * from './lib/platform/syncProtocolContract.ts';";
  const outfile = path.join(root, 'runtime.mjs');
  const input = path.join(root, 'entry.ts');
  await writeFile(input, entry);
  await build({ configFile: false, logLevel: 'silent', build: { outDir: root, emptyOutDir: false,
    lib: { entry: input, formats: ['es'], fileName: () => 'runtime.mjs' },
    rolldownOptions: { external: id => !id.startsWith('.') && !path.isAbsolute(id) } } });
  const runtime: Pick<typeof Migrations, 'initializeDatabaseSchema'> &
    Pick<typeof Inventory, 'readFramedSyncInventory' | 'readFramedSyncInventoryEntry'> &
    Pick<typeof Apply, 'applyRequestSyncObject'> & Pick<typeof Snapshot, 'writeRequestSyncSnapshot'> &
    Pick<typeof Edit, 'applyLocalContentEdit'> &
    Pick<typeof Protocol, 'evaluateSyncProtocolCompatibility'> &
    { CURRENT_SYNC_PROTOCOL_DESCRIPTOR: Protocol.SyncProtocolDescriptor } =
    await import(pathToFileURL(outfile).href);
  return { runtime, close: () => rm(root, { recursive: true, force: true }) };
}
