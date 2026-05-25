#!/usr/bin/env node
/* global console, process */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export { buildSearchIndexSizeReport } from './search-index-size-report-core.mjs';

import { buildSearchIndexSizeReport } from './search-index-size-report-core.mjs';

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      throw new Error(`unexpected argument: ${token ?? '<empty>'}`);
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!name || !value || value.startsWith('--')) {
      throw new Error(`missing value for --${name || '<empty>'}`);
    }
    flags.set(name, value);
    index += 1;
  }
  const dbPath = flags.get('db');
  if (!dbPath) {
    throw new Error('missing required flag --db');
  }
  return { dbPath: path.resolve(dbPath) };
}

function main() {
  const { dbPath } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(buildSearchIndexSizeReport(dbPath), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
