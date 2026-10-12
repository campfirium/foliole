import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function verifyOfflineElectronArchive(archive, expected) {
  const actual = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  if (typeof expected !== 'string' || actual !== expected) throw new Error('Offline Electron archive checksum mismatch');
  return actual;
}

async function prepareOfflineElectron(root) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 required');
  const require = createRequire(import.meta.url);
  const electronRoot = path.dirname(require.resolve('electron/package.json'));
  const electronRequire = createRequire(path.join(electronRoot, 'package.json'));
  const { version } = require(path.join(electronRoot, 'package.json'));
  const filename = `electron-v${version}-win32-x64.zip`;
  const archive = path.resolve('.tmp/artifacts', filename);
  const sha256 = verifyOfflineElectronArchive(archive, require(path.join(electronRoot, 'checksums.json'))[filename]);
  const { Cache } = await import(pathToFileURL(path.join(path.dirname(electronRequire.resolve('@electron/get')), 'Cache.js')).href);
  const cacheFile = new Cache().getCachePath(`https://github.com/electron/electron/releases/download/v${version}/${filename}`, filename);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.copyFileSync(archive, cacheFile);
  const { extract } = electronRequire('@electron-internal/extract-zip');
  const dist = path.join(electronRoot, 'dist');
  await extract(archive, { dir: dist });
  if (fs.readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '') !== version
      || !fs.existsSync(path.join(dist, 'electron.exe'))) throw new Error('Extracted Electron runtime verification failed');
  const definitions = path.join(dist, 'electron.d.ts');
  if (fs.existsSync(definitions)) fs.renameSync(definitions, path.join(electronRoot, 'electron.d.ts'));
  fs.writeFileSync(path.join(electronRoot, 'path.txt'), 'electron.exe');
  fs.mkdirSync(root, { recursive: true });
  const report = { version, archive, sha256, cacheFile, binary: path.join(dist, 'electron.exe'), offline: true };
  fs.writeFileSync(path.join(root, 'electron-offline.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(process.argv[2]);
  const relative = path.relative(path.resolve('.tmp/artifacts'), root);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Temporary evidence root required');
  await prepareOfflineElectron(root);
}
