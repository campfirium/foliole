export const LINUX_EXPERIMENTAL_NOTICE = [
  'Linux Experimental — Ubuntu 24.04 x64 is the only tested baseline.',
  'Download the AppImage, run `chmod +x` on it, then launch it directly.',
  'Automatic updates and desktop integration are not included.'
].join('\n');

export function hasLinuxExperimentalNotice(body) {
  return typeof body === 'string' && body.includes(LINUX_EXPERIMENTAL_NOTICE);
}

export function requireLinuxExperimentalNotice(body) {
  if (!hasLinuxExperimentalNotice(body)) {
    throw new Error('Linux release copy must include the reviewed Experimental usage notice');
  }
  return body;
}

async function main() {
  const writePath = process.argv.find((arg) => arg.startsWith('--write='))?.slice(8);
  const verifyPath = process.argv.find((arg) => arg.startsWith('--verify='))?.slice(9);
  if (writePath && !verifyPath) {
    await writeFile(writePath, `${LINUX_EXPERIMENTAL_NOTICE}\n`);
    return;
  }
  if (verifyPath && !writePath) {
    requireLinuxExperimentalNotice(await readFile(verifyPath, 'utf8'));
    return;
  }
  throw new Error('exactly one of --write or --verify is required');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[linux-experimental-copy] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
