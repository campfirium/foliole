/* global fetch, AbortSignal */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

export async function downloadPinned(directory, name, pin) {
  mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, name);
  if (existsSync(destination)) {
    if (sha256(readFileSync(destination)) !== pin.sha256) {
      throw new Error(`Cached SQLCipher input checksum mismatch: ${name}`);
    }
    return destination;
  }
  const response = await fetch(pin.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${pin.url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== pin.sha256) throw new Error(`SQLCipher input checksum mismatch: ${name}`);
  writeFileSync(destination, bytes);
  return destination;
}

export async function extractPinned(cache, name, pin) {
  const archive = await downloadPinned(path.join(cache, 'downloads'), `${name}.tar.gz`, pin);
  const source = path.join(cache, name);
  const receipt = path.join(source, '.foliole-source-sha256');
  if (existsSync(receipt) && readFileSync(receipt, 'utf8').trim() === pin.sha256) return source;
  mkdirSync(source, { recursive: true });
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', source]);
  writeFileSync(receipt, `${pin.sha256}\n`);
  return source;
}

export async function prepareCore(cache, pins) {
  const source = await extractPinned(cache, 'core', pins.core);
  const build = path.join(cache, 'amalgamation');
  mkdirSync(build, { recursive: true });
  if (!existsSync(path.join(build, 'sqlite3.c')) || !existsSync(path.join(build, 'sqlite3.h'))) {
    run(path.join(source, 'configure'), ['--disable-tcl', '--with-tempstore=yes'], {
      cwd: build,
      env: { ...process.env, CFLAGS: '-O2 -DSQLITE_HAS_CODEC -DSQLCIPHER_CRYPTO_CC' }
    });
    run('make', ['-j2', 'sqlite3.c'], { cwd: build });
  }
  return { source, build };
}
