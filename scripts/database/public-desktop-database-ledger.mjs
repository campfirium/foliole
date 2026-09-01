const RELEASE_PATTERN = /^v\d+\.\d+\.\d+$/;

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`duplicate ${label} registration`);
  }
}

function assertSameMembers(actual, expected, label) {
  const actualSet = new Set(actual);
  const missing = expected.filter((value) => !actualSet.has(value));
  const unknown = actual.filter((value) => !expected.includes(value));
  if (missing.length || unknown.length) {
    throw new Error(`${label} registration is broken: missing=${missing.join(',') || '-'} unknown=${unknown.join(',') || '-'}`);
  }
}

export function validatePublicDesktopDatabaseLedger(ledger) {
  if (ledger?.ledgerVersion !== 1 || ledger.databaseFile !== 'foliole.db') {
    throw new Error('unknown public Desktop database ledger format');
  }
  const releases = ledger.publicDesktopReleases ?? [];
  const mappings = ledger.releaseSchemaMappings ?? [];
  const fixtures = ledger.fixtures ?? [];
  assertUnique(releases, 'public release');
  assertUnique(mappings.map(({ release }) => release), 'release mapping');
  assertUnique(fixtures.map(({ schema }) => schema), 'fixture schema');
  assertUnique(fixtures.map(({ file }) => file), 'fixture file');
  if (releases.some((release) => !RELEASE_PATTERN.test(release))) {
    throw new Error('unknown public Desktop release identity');
  }
  assertSameMembers(mappings.map(({ release }) => release), releases, 'release mapping');
  const schemas = mappings.map(({ schema }) => schema);
  if (schemas[0] !== ledger.compatibilityFloorSchema || schemas.at(-1) !== ledger.latestRecordedSchema) {
    throw new Error('public Desktop schema boundary is broken');
  }
  if (schemas.some((schema, index) => index > 0 && schema < schemas[index - 1])) {
    throw new Error('public Desktop schema history must be monotonic');
  }
  const distinctSchemas = [...new Set(schemas)];
  assertSameMembers(fixtures.map(({ schema }) => schema), distinctSchemas, 'fixture schema');
  for (const fixture of fixtures) {
    const mapped = mappings.find(({ release }) => release === fixture.sourceRelease);
    if (!mapped || mapped.schema !== fixture.schema) {
      throw new Error(`fixture schema ${fixture.schema} has invalid source release`);
    }
  }
  return ledger;
}

export function resolvePublicDesktopReleaseSchema(ledger, release) {
  validatePublicDesktopDatabaseLedger(ledger);
  const mapping = ledger.releaseSchemaMappings.find((entry) => entry.release === release);
  if (!mapping) throw new Error(`unknown public Desktop release: ${release}`);
  return mapping.schema;
}
