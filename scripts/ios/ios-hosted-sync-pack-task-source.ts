import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import type { SqliteDatabase } from '../../electron/database/connection.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { seedHostedSourceFromOracle } from './ios-hosted-sync-pack-oracle-seed.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export async function createHostedPackTaskSource(args: {
  artifactRoot: string;
  oraclePackPath: string;
  sourceName: string;
}) {
  const artifactRoot = path.resolve(args.artifactRoot);
  const sourceRoot = path.resolve(artifactRoot, 'live-pack-sources', args.sourceName);
  assertInside(artifactRoot, sourceRoot);
  mkdirSync(sourceRoot, { recursive: true });
  const sourcePath = path.join(sourceRoot, 'source.db');
  const sqlite = new BetterSqlite3(sourcePath) as SqliteDatabase;
  try {
    initializeDatabaseSchema(sqlite);
    const projection = await seedHostedSourceFromOracle({
      oraclePackPath: args.oraclePackPath,
      source: sqlite,
      stagingRoot: sourceRoot
    });
    return {
      close: () => sqlite.close(),
      driver: createBetterSqlite3Driver(sqlite),
      relativeLocator: path.relative(artifactRoot, sourcePath),
      ...projection,
      sqlite
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

function assertInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('ios_hosted_source_outside_attempt_root');
  }
}
