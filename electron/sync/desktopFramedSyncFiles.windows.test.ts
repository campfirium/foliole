// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'vite';
import { expect, it } from 'vitest';

it('publishes files when Windows mkdir returns a namespaced first-created path', async () => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/windows-directory-regression-'));
  try {
    const bundle = path.join(root, 'files.mjs');
    await build({ configFile: false, logLevel: 'silent', build: { ssr: true, outDir: root,
      emptyOutDir: false, minify: false, rolldownOptions: {
        input: 'electron/sync/desktopFramedSyncFiles.ts', platform: 'node',
        preserveEntrySignatures: 'strict',
        output: { entryFileNames: path.basename(bundle), format: 'esm' }
      } } });
    const probe = path.join(root, 'probe.mjs');
    await writeFile(probe, `import { promises as fs } from 'node:fs';
import { createDesktopFramedSyncFiles } from './files.mjs';
Object.defineProperty(process, 'platform', { value: 'win32' });
const mkdir = fs.mkdir;
fs.mkdir = async (...args) => {
  const first = await mkdir(...args);
  return first ? ${JSON.stringify('\\\\?\\')} + first : first;
};
const files = createDesktopFramedSyncFiles(${JSON.stringify(root)});
await files.write('demands/new/item.json', new TextEncoder().encode('saved'));
const reopened = createDesktopFramedSyncFiles(${JSON.stringify(root)});
if (new TextDecoder().decode(await reopened.read('demands/new/item.json')) !== 'saved') throw new Error('write_not_published');
`);
    // A separate process lets this regression fail even when microtasks starve timers.
    const result = spawnSync(process.execPath, [probe], { encoding: 'utf8', timeout: 2000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    expect({ error: result.error?.message, status: result.status, stderr: result.stderr })
      .toEqual({ error: undefined, status: 0, stderr: '' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
