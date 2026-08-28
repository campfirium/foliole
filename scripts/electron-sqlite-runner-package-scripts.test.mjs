// @vitest-environment node
/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PACKAGE_PATH = path.resolve(process.cwd(), 'package.json');
const RUNNER_PREFIX = 'node scripts/electron-sqlite-runner.mjs ';
const HOSTED_GUARD = 'node scripts/quality/quality-command-contracts.mjs allow test:changed && ';

const SQLITE_SCRIPT_COMMANDS = [
  'test:changed',
  'oneoff:workspace:backfill-opening-text',
  'oneoff:source-dispositions:backfill',
  'sqlite:backup',
  'sqlite:restore',
  'sqlite:prune-search-invalidations',
  'oneoff:sqlite:node-kind-report',
  'android:sync:audit',
  'android:sync:scenario'
];

describe('electron sqlite runner package scripts', () => {
  it('routes sqlite-sensitive package scripts through the Electron ABI runner', async () => {
    const manifest = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));

    for (const commandName of SQLITE_SCRIPT_COMMANDS) {
      const command = commandName === 'test:changed'
        ? manifest.scripts[commandName].slice(HOSTED_GUARD.length)
        : manifest.scripts[commandName];
      if (commandName === 'test:changed') {
        expect(manifest.scripts[commandName].startsWith(HOSTED_GUARD)).toBe(true);
      }
      expect(command.startsWith(RUNNER_PREFIX)).toBe(true);
    }
  });

  it('gives the hosted Android aggregate bounded headroom on slower Windows runners', async () => {
    const manifest = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
    const command = manifest.scripts['test:release:android'];

    expect(command).toContain('--testTimeout=45000');
    expect(command).toContain('--hookTimeout=30000');
  });
});
