import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { NODE_KIND_MIGRATION_CANDIDATES_META_KEY } from '../../lib/core/nodes/nodeKind.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3');

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dbPath = requireFlag(flags, 'db-path');
  const sqlite = new BetterSqlite3(resolvePath(dbPath));

  try {
    initializeDatabaseSchema(sqlite);
    const row = sqlite
      .prepare('SELECT value FROM workspace_meta WHERE key = ?')
      .get(NODE_KIND_MIGRATION_CANDIDATES_META_KEY) as { value?: string } | undefined;
    const payload = row?.value ? JSON.parse(row.value) : { candidates: [], generatedAt: null, strategy: null };
    const output = JSON.stringify(payload, null, 2);
    const outputPath = flags.get('output');
    if (outputPath) {
      await writeFile(resolvePath(outputPath), `${output}\n`, 'utf8');
    }
    console.log(output);
  } finally {
    sqlite.close();
  }
}

function parseFlags(argv: string[]) {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) {
      throw new Error(`unexpected argument: ${token ?? '<empty>'}`);
    }
    const flagName = token.slice(2);
    const flagValue = argv[index + 1];
    if (!flagName || !flagValue || flagValue.startsWith('--')) {
      throw new Error(`missing value for ${token}`);
    }
    flags.set(flagName, flagValue);
    index += 1;
  }

  return flags;
}

function requireFlag(flags: Map<string, string>, flagName: string) {
  const value = flags.get(flagName)?.trim();
  if (!value) {
    throw new Error(`missing required flag --${flagName}`);
  }
  return value;
}

function resolvePath(filePath: string) {
  return path.resolve(filePath);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[node-kind-report] ${message}`);
  process.exit(1);
});
