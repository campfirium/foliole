// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import type { DbPort, DbPortFactory } from '../../lib/core/sync/dbPort.js';
import { registerDbPortConformanceTests } from '../../lib/core/sync/dbPortConformance.js';

import { openBetterSqliteDbPort } from './betterSqliteDbPort.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';
const opened = new Map<DbPort, ReturnType<typeof openBetterSqliteDbPort>>();

const factory: DbPortFactory = {
  async open(name) {
    const openedPort = openBetterSqliteDbPort(BetterSqlite3, this.path(name), { name });
    opened.set(openedPort.port, openedPort);
    return openedPort.port;
  },
  async close(port) {
    const openedPort = opened.get(port);
    if (!openedPort) return;
    openedPort.close();
    opened.delete(port);
  },
  path(name) {
    return path.join(tempRoot, `${name}.db`);
  }
};

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-db-port-'));
});

afterAll(async () => {
  for (const port of Array.from(opened.keys())) {
    await factory.close(port);
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

registerDbPortConformanceTests('better-sqlite3 DbPort', factory, { expect, it });
