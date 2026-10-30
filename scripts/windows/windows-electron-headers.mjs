import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function electronHeaderFiles(repoRoot, version) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(version)) throw new Error('Invalid Electron header version');
  const root = path.join(repoRoot, '.tmp', 'artifacts');
  const prefix = `electron-v${version}-headers`;
  return [
    { remote: 'SHASUMS256.txt', file: path.join(root, `${prefix}-SHASUMS256.txt`) },
    { remote: `node-v${version}-headers.tar.gz`, file: path.join(root, `${prefix}.tar.gz`) },
    { remote: 'win-x64/node.lib', file: path.join(root, `${prefix}-x64-node.lib`) }
  ];
}

function verifyHeaders(files) {
  const sums = new Map(fs.readFileSync(files[0].file, 'utf8').trim().split(/\r?\n/u).map(line => {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/u.exec(line);
    if (!match) throw new Error('Invalid Electron header checksums');
    return [match[2], match[1]];
  }));
  for (const asset of files.slice(1)) {
    const actual = createHash('sha256').update(fs.readFileSync(asset.file)).digest('hex');
    if (actual !== sums.get(asset.remote)) throw new Error(`Electron header checksum mismatch: ${asset.remote}`);
  }
}

export async function transferWindowsElectronHeaders({ env, executeScp, host, repoRoot, version,
  transport, fetch = globalThis.fetch }) {
  const files = electronHeaderFiles(repoRoot, version);
  fs.mkdirSync(path.dirname(files[0].file), { recursive: true });
  for (const asset of files) {
    if (!fs.existsSync(asset.file)) {
      const response = await fetch(`https://www.electronjs.org/headers/v${version}/${asset.remote}`,
        { signal: globalThis.AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Electron headers download failed: ${asset.remote} HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(`${asset.file}.partial`, bytes);
      fs.renameSync(`${asset.file}.partial`, asset.file);
    }
  }
  verifyHeaders(files);
  const identity = transport({ env, home: os.homedir(), host });
  for (const asset of files) {
    await executeScp(['-q', ...identity.options, asset.file,
      `${host}:D:/C/foliole/.tmp/artifacts/${path.basename(asset.file)}`], { env });
  }
  return files;
}

export function importWindowsElectronHeaders({ repoRoot, version, home = os.homedir(), run = spawnSync }) {
  const files = electronHeaderFiles(repoRoot, version);
  verifyHeaders(files);
  const require = createRequire(path.join(repoRoot, 'node_modules', '@electron', 'rebuild', 'package.json'));
  const { installVersion } = require('node-gyp/package.json');
  const root = path.join(home, '.electron-gyp', version);
  const staging = path.join(home, '.electron-gyp', `${version}.offline-staging`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    const extracted = run('tar', ['-xzf', path.basename(files[1].file), '--strip-components=1', '-C', staging.split(path.sep).join('/')],
      { cwd: path.dirname(files[1].file), encoding: 'utf8', windowsHide: true });
    if (extracted.status !== 0) throw new Error(`Electron headers extraction failed: ${extracted.stderr}`);
    for (const file of ['common.gypi', 'config.gypi', 'node.h']) {
      if (!fs.existsSync(path.join(staging, 'include', 'node', file))) {
        throw new Error(`Electron headers incomplete: ${file}`);
      }
    }
    fs.mkdirSync(path.join(staging, 'x64'), { recursive: true });
    fs.copyFileSync(files[2].file, path.join(staging, 'x64', 'node.lib'));
    fs.writeFileSync(path.join(staging, 'installVersion'), `${installVersion}\n`);
    fs.rmSync(root, { recursive: true, force: true });
    fs.renameSync(staging, root);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return root;
}
