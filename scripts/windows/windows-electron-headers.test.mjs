// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';

import { electronHeaderFiles, importWindowsElectronHeaders, transferWindowsElectronHeaders } from './windows-electron-headers.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture() {
  const repoRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/windows-headers-'));
  roots.push(repoRoot);
  const version = '45.1.0';
  const source = path.join(repoRoot, 'source');
  for (const file of ['common.gypi', 'config.gypi', 'node.h']) {
    write(path.join(source, 'node_headers', 'include', 'node', file), `verified ${file}`);
  }
  const archive = path.join(repoRoot, 'source.tar.gz');
  const created = spawnSync('tar', ['-czf', path.basename(archive), '-C', 'source', 'node_headers'],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  expect(created.status, created.error?.message ?? created.stderr).toBe(0);
  const bytes = [fs.readFileSync(archive), Buffer.from('verified Windows x64 library')];
  const files = electronHeaderFiles(repoRoot, version);
  const sums = bytes.map((body, index) => `${createHash('sha256').update(body).digest('hex')}  ${files[index + 1].remote}`).join('\n');
  const contents = [Buffer.from(sums), ...bytes];
  const fetch = vi.fn(async url => {
    const index = files.findIndex(file => url.endsWith(file.remote));
    if (index < 0) throw new Error(`Unexpected download ${url}`);
    return { ok: true, arrayBuffer: async () => contents[index] };
  });
  write(path.join(repoRoot, 'node_modules/@electron/rebuild/package.json'), '{}');
  write(path.join(repoRoot, 'node_modules/node-gyp/package.json'), '{"installVersion":11}');
  const options = { repoRoot, version, host: 'windows@example', env: {}, fetch,
    executeScp: vi.fn(), transport: () => ({ options: ['-o', 'BatchMode=yes'] }) };
  return { options, files, home: path.join(repoRoot, 'home') };
}

it('downloads and verifies the exact headers and x64 library on Mac and transfers both with checksums', async () => {
  const { options, files, home } = fixture();
  await transferWindowsElectronHeaders(options);
  await transferWindowsElectronHeaders(options);
  expect(options.fetch).toHaveBeenCalledTimes(3);
  expect(options.fetch.mock.calls.every(([url]) => url.startsWith('https://www.electronjs.org/headers/v45.1.0/'))).toBe(true);
  expect(options.executeScp.mock.calls.slice(0, 3).map(([args]) => args.at(-1))).toEqual(
    files.map(({ file }) => `windows@example:D:/C/foliole/.tmp/artifacts/${path.basename(file)}`));
  const root = importWindowsElectronHeaders({ ...options, home });
  expect(fs.readFileSync(path.join(root, 'installVersion'), 'utf8')).toBe('11\n');
  expect(fs.readFileSync(path.join(root, 'include/node/node.h'), 'utf8')).toBe('verified node.h');
  expect(fs.readFileSync(path.join(root, 'x64/node.lib'), 'utf8')).toBe('verified Windows x64 library');
  expect(options.fetch).toHaveBeenCalledTimes(3);
});

it('rejects corrupted transfers before replacing any existing header cache', async () => {
  const { options, files, home } = fixture();
  await transferWindowsElectronHeaders(options);
  const root = importWindowsElectronHeaders({ ...options, home });
  fs.appendFileSync(files[2].file, 'corrupt');
  expect(() => importWindowsElectronHeaders({ ...options, home })).toThrow('checksum mismatch');
  expect(fs.readFileSync(path.join(root, 'x64/node.lib'), 'utf8')).toBe('verified Windows x64 library');
  options.executeScp.mockClear();
  await expect(transferWindowsElectronHeaders(options)).rejects.toThrow('checksum mismatch');
  expect(options.executeScp).not.toHaveBeenCalled();
});

it('refuses missing offline resources without downloading or rebuilding', () => {
  const { options, home } = fixture();
  const run = vi.fn();
  expect(() => importWindowsElectronHeaders({ ...options, home, run })).toThrow('ENOENT');
  expect(run).not.toHaveBeenCalled();
  expect(options.fetch).not.toHaveBeenCalled();
});
