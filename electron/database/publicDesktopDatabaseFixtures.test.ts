// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  readBusinessSentinels,
  readStructureSummary,
  sha256
} from '../../scripts/database/public-desktop-database-fixture-contract.mjs';
import { validatePublicDesktopDatabaseLedger } from '../../scripts/database/public-desktop-database-ledger.mjs';

const fixtureRoot = path.resolve('electron/database/fixtures/public-desktop-main');
const ledger = validatePublicDesktopDatabaseLedger(JSON.parse(readFileSync(
  'lib/core/database/publicDesktopDatabaseLedger.json', 'utf8'
)));
const manifest = JSON.parse(readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'));

describe('public Desktop database fixtures', () => {
  it('provides one provenance record for every frozen schema', () => {
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.ledger).toBe('lib/core/database/publicDesktopDatabaseLedger.json');
    expect(manifest.fixtures.map(({ schema }: { schema: number }) => schema))
      .toEqual(ledger.fixtures.map(({ schema }: { schema: number }) => schema));
  });

  it.each(manifest.fixtures)('opens schema $schema and matches provenance', (provenance) => {
    const registration = ledger.fixtures.find(({ schema }: { schema: number }) => (
      schema === provenance.schema
    ));
    expect(registration).toEqual({
      schema: provenance.schema,
      sourceRelease: provenance.sourceRelease,
      file: provenance.file
    });
    expect(provenance.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance.sourceLibraryFilesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(provenance.creationPath).toBe('tagged initializeDatabaseSchema fresh path');
    expect(provenance.dataOrigin).toBe('deterministic synthetic business sentinels; no user data');

    const fixturePath = path.join(fixtureRoot, provenance.file);
    expect(sha256(readFileSync(fixturePath))).toBe(provenance.databaseSha256);
    const sqlite = new Database(fixturePath, { readonly: true, fileMustExist: true });
    try {
      expect(sqlite.pragma('user_version', { simple: true })).toBe(provenance.schema);
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(readStructureSummary(sqlite)).toEqual(provenance.structure);
      expect(sha256(JSON.stringify(readBusinessSentinels(sqlite))))
        .toBe(provenance.businessSentinelsSha256);
    } finally {
      sqlite.close();
    }
  });
});
