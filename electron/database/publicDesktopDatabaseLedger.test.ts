// @vitest-environment node

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  resolvePublicDesktopReleaseSchema,
  validatePublicDesktopDatabaseLedger
} from '../../scripts/database/public-desktop-database-ledger.mjs';

const ledgerPath = new URL('../../lib/core/database/publicDesktopDatabaseLedger.json', import.meta.url);

function readLedger() {
  return JSON.parse(readFileSync(ledgerPath, 'utf8'));
}

function cloneLedger() {
  return structuredClone(readLedger());
}

describe('public Desktop database ledger', () => {
  it('maps every frozen public release to one schema and every schema to one fixture', () => {
    const ledger = validatePublicDesktopDatabaseLedger(readLedger());

    expect(ledger.publicDesktopReleases.map((release: string) => (
      resolvePublicDesktopReleaseSchema(ledger, release)
    ))).toEqual([46, 46, 48, 48, 48, 48, 61, 62, 62, 62, 62, 62, 65, 65, 66, 77, 78]);
    expect(ledger.fixtures.map(({ schema }: { schema: number }) => schema))
      .toEqual([46, 48, 61, 62, 65, 66, 77, 78]);
  });

  it('rejects unknown releases and duplicate registrations', () => {
    expect(() => resolvePublicDesktopReleaseSchema(readLedger(), 'v0.6.0'))
      .toThrow('unknown public Desktop release');

    const ledger = cloneLedger();
    ledger.releaseSchemaMappings.push({ release: 'v0.6.1', schema: 46 });
    expect(() => validatePublicDesktopDatabaseLedger(ledger))
      .toThrow('duplicate release mapping registration');
  });

  it('rejects broken release and fixture coverage', () => {
    const missingRelease = cloneLedger();
    missingRelease.releaseSchemaMappings.splice(4, 1);
    expect(() => validatePublicDesktopDatabaseLedger(missingRelease))
      .toThrow('release mapping registration is broken');

    const missingFixture = cloneLedger();
    missingFixture.fixtures.splice(2, 1);
    expect(() => validatePublicDesktopDatabaseLedger(missingFixture))
      .toThrow('fixture schema registration is broken');
  });

  it('rejects schema history that moves backward', () => {
    const ledger = cloneLedger();
    ledger.releaseSchemaMappings[7].schema = 47;
    expect(() => validatePublicDesktopDatabaseLedger(ledger))
      .toThrow('schema history must be monotonic');
  });
});
