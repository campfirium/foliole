import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { prepareCore, sha256 } from './mobile-sqlcipher-sources.mjs';
import { buildAppleSqlcipher } from './mobile-sqlcipher-apple.mjs';
import { buildAndroidSqlcipher } from './mobile-sqlcipher-android.mjs';
import { prepareNativeRsync } from './mobile-sqlcipher-rsync.mjs';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const pins = JSON.parse(readFileSync(new URL('./mobile-sqlcipher-pins.json', import.meta.url)));

function patchIosPlugin(root, packageDirectory) {
  const plugin = path.join(root, 'node_modules/@capacitor-community/sqlite');
  const version = JSON.parse(readFileSync(path.join(plugin, 'package.json'))).version;
  if (version !== '8.1.1') throw new Error(`Review the SQLCipher integration for SQLite plugin ${version}`);
  const manifest = path.join(plugin, 'Package.swift');
  const original = '.package(url: "https://github.com/sqlcipher/SQLCipher.swift.git", from: "4.14.0")';
  const relative = path.relative(plugin, packageDirectory).split(path.sep).join('/');
  const replacement = `.package(name: "SQLCipher.swift", path: "${relative}")`;
  const text = readFileSync(manifest, 'utf8');
  if (text.includes(replacement)) return;
  const previous = /\.package\(name: "SQLCipher\.swift", path: "(?:\.\.\/){3}\.cache\/mobile-sqlcipher\/4\.20\.0\/[a-f0-9]{20}\/apple\/SQLCipher\.swift"\)/;
  const current = text.includes(original) ? original : text.match(previous)?.[0];
  if (!current || text.split(current).length !== 2) throw new Error('Unexpected SQLite plugin Swift package dependency');
  writeFileSync(manifest, text.replace(current, replacement));
}

export async function prepareMobileSqlcipher(platform, { root = repositoryRoot } = {}) {
  if (!['ios', 'android'].includes(platform)) throw new Error(`Unsupported SQLCipher host: ${platform}`);
  const inputs = ['sources', 'apple', 'android', 'rsync'].map(name =>
    readFileSync(new URL(`./mobile-sqlcipher-${name}.mjs`, import.meta.url)));
  const nativeRoot = path.join(root, 'lib/native/folderBackup');
  for (const name of ['FolioleFolderBackup.h', 'FolioleFolderBackupInternal.h',
    'FolioleFolderBackup.c', 'FolioleFolderBackupTransport.c', 'FolioleFolderBackupFingerprint.inc',
    'FolioleFolderBackupAndroid.h', 'FolioleFolderBackupAndroidIo.c',
    'FolioleFolderBackupAndroidVfs.c', 'FolioleFolderBackupAndroidJni.c']) inputs.push(readFileSync(path.join(nativeRoot, name)));
  const key = sha256(Buffer.concat([Buffer.from(JSON.stringify(pins)), ...inputs])).slice(0, 20);
  const cache = path.join(root, '.cache/mobile-sqlcipher', pins.version, key);
  const core = await prepareCore(cache, pins);
  core.nativeRoot = nativeRoot;
  prepareNativeRsync(core);
  const result = platform === 'ios'
    ? await buildAppleSqlcipher({ root, cache, core, pins })
    : await buildAndroidSqlcipher({ root, cache, core, pins });
  if (platform === 'ios') patchIosPlugin(root, result.packageDirectory);
  const receipt = path.join(root, '.cache/mobile-sqlcipher', `${platform}.json`);
  writeFileSync(receipt, `${JSON.stringify(result, null, 2)}\n`);
  if (!existsSync(result.artifact)) throw new Error('SQLCipher build did not produce its artifact');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const platform = process.env.CAPACITOR_PLATFORM_NAME ?? process.argv[2];
  if (!platform) throw new Error('Pass ios or android, or use the Capacitor sync hook');
  await prepareMobileSqlcipher(platform);
  console.log(`Prepared SQLCipher ${pins.version} with DBPAGE for ${platform}`);
}
