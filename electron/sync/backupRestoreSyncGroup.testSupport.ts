import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { build } from 'vite';

import type { FixtureReply } from './backupRestoreSyncGroup.fixture.js';

export async function buildRestoreFixture(outputPath: string) {
  await build({ configFile: false, logLevel: 'silent', ssr: { noExternal: ['electron'] },
    plugins: [{ name: 'isolate-electron-os', enforce: 'pre', resolveId(id, importer) {
      if (id === 'electron') return path.resolve('electron/sync/backupRestoreSyncGroup.electron.fixture.ts');
      if (importer && id.startsWith('.') && id.endsWith('.js')) {
        const source = path.resolve(path.dirname(importer), id.slice(0, -3) + '.ts');
        if (existsSync(source)) return source;
      }
      return null;
    } }],
    build: { ssr: true, outDir: path.dirname(outputPath), emptyOutDir: false, minify: false,
      rolldownOptions: { input: 'electron/sync/backupRestoreSyncGroup.fixture.ts', platform: 'node',
        external: (id) => id !== 'electron' && !id.startsWith('.') && !path.isAbsolute(id),
        output: { entryFileNames: path.basename(outputPath), chunkFileNames: '[name]-[hash].mjs',
          format: 'esm', codeSplitting: false,
          banner: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } }
    }
  });
}

export function startRestoreFixture(script: string, root: string, port: number) {
  const child = fork(script, [], { execPath: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FOLIOLE_ELECTRON_TEST_STATE_ROOT: root,
      FOLIOLE_COMPANION_SYNC_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let sequence = 0;
  let diagnostics = '';
  child.stdout?.on('data', (data) => { diagnostics += String(data); });
  child.stderr?.on('data', (data) => { diagnostics += String(data); });
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  child.on('message', (message: { id: number; result: unknown; error?: string }) => {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error));
    else request?.resolve(message.result);
  });
  child.on('exit', (code) => {
    for (const request of pending.values()) request.reject(new Error(`fixture exited ${code}: ${diagnostics}`));
    pending.clear();
  });
  const send = (action: string, args: Record<string, unknown> = {}) => new Promise<unknown>((resolve, reject) => {
    if (!child.connected) { reject(new Error(`fixture unavailable: ${diagnostics}`)); return; }
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.send({ id, action, args }, (error) => {
      if (error) { pending.delete(id); reject(error); }
    });
  });
  const sendTyped = async (action: string, args: Record<string, unknown> = {}) =>
    await send(action, args) as FixtureReply;
  return { child, send: sendTyped, diagnostics: () => diagnostics, async close() {
    try { if (child.connected) await send('close'); } finally { await terminate(child); }
  } };
}

function terminate(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once('exit', () => resolve());
    child.kill();
  });
}
