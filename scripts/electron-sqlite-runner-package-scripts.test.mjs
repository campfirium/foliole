// @vitest-environment node
/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PACKAGE_PATH = path.resolve(process.cwd(), 'package.json');
const RUNNER_PREFIX = 'node scripts/electron-sqlite-runner.mjs ';

const SQLITE_SCRIPT_COMMANDS = [
  'oneoff:workspace:backfill-opening-text',
  'oneoff:source-dispositions:backfill',
  'sqlite:backup',
  'sqlite:restore',
  'oneoff:sqlite:node-kind-report',
  'android:reset-sync-data',
  'android:sync:audit',
  'android:sync:scenario'
];

describe('electron sqlite runner package scripts', () => {
  it('routes real sqlite maintenance commands through the Electron ABI runner', async () => {
    const manifest = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));

    for (const commandName of SQLITE_SCRIPT_COMMANDS) {
      expect(manifest.scripts[commandName].startsWith(RUNNER_PREFIX)).toBe(true);
    }
  });
});
