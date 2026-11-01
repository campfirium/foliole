// @vitest-environment node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { prepareWindowsNpmBundle } from './windows-npm-offline-bundle.mjs';

function createTarball(root, version) {
  fs.mkdirSync(path.join(root, 'package'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package/package.json'), JSON.stringify({ name: 'locked-offline-fixture', version }));
  fs.writeFileSync(path.join(root, 'package/index.js'), 'module.exports = 1;');
  const archive = path.join(root, `fixture-${version}.tgz`);
  const result = spawnSync('tar', ['-czf', archive, '-C', root, 'package']);
  if (result.status !== 0) throw new Error('Fixture tar creation failed');
  return archive;
}

async function serveTarballs(archives) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import http from 'node:http'; import fs from 'node:fs';
    const files = new Map(JSON.parse(process.argv[1]).map((file, index) => ['/fixture-' + index + '.tgz', fs.readFileSync(file)]));
    const server = http.createServer((request, response) => response.end(files.get(request.url)));
    server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port)));
  `, JSON.stringify(archives)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', (bytes) => resolve(Number(bytes.toString())));
    child.once('exit', (code) => reject(new Error(`Fixture server exited: ${code}`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

it.runIf(process.platform !== 'win32')('preserves two locked versions of one package with the pinned npm fetch policy', async () => {
  const artifacts = path.resolve('.tmp/artifacts/T680/npm-pack-policy');
  fs.mkdirSync(artifacts, { recursive: true });
  const root = fs.mkdtempSync(path.join(artifacts, 'bundle-'));
  const archives = ['1.0.0', '2.0.0'].map(version => createTarball(root, version));
  const server = await serveTarballs(archives);
  try {
    const expected = archives.map((archive, index) => {
      const bytes = fs.readFileSync(archive);
      return { bytes, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        resolved: `${server.url}/fixture-${index}.tgz` };
    });
    const lock = { packages: Object.fromEntries(expected.map((entry, index) => [`node_modules/copy-${index}`, entry])) };
    const run = (command, args, options) => command === 'git'
      ? { status: 0, stdout: args[0] === 'rev-parse' ? 'f'.repeat(40) : JSON.stringify(lock) }
      : spawnSync(command, args, { ...options, env: { ...process.env, npm_config_cache: path.join(root, 'npm-cache') } });
    const bundle = prepareWindowsNpmBundle({ repoRoot: root, revision: 'HEAD', run });
    expect(bundle).toMatchObject({ count: 2, reused: false });
    const unpacked = path.join(root, 'unpacked');
    fs.mkdirSync(unpacked);
    expect(spawnSync('tar', ['-xf', bundle.bundlePath, '-C', unpacked]).status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'));
    expect(manifest.files).toHaveLength(2);
    for (const { bytes, integrity } of expected) {
      const file = manifest.files.find(entry => entry.integrity === integrity)?.file;
      expect(file).toBeTruthy();
      expect(fs.readFileSync(path.join(unpacked, 'tarballs', file))).toEqual(bytes);
    }
  } finally {
    server.child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
