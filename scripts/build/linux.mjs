/* global console, process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { packageLinuxDeb } from '../linux/package-linux-deb.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

try {
  const metadata = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  await packageLinuxDeb(metadata.version);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
