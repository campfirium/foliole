export function createPassingProviders(overrides = {}) {
  const pass = (owner) => async () => ({ action: `${owner} proven`, missingFacts: [], status: 'passed' });
  return Object.fromEntries([
    'source', 'action', 'target', 'mutation', 'integrity', 'cleanup', 'locator'
  ].map((owner) => [owner, overrides[owner] ?? pass(owner)]));
}

export function localFixtureDefinition(overrides = {}) {
  return {
    action: { id: 'fixture-host-qualification' },
    cleanup: { complete: true, owner: 'fixture', strategy: 'exact-owned-resource' },
    integrity: { archive: 'verified', data: 'verified' },
    locator: { kind: 'receipt-json', root: '.tmp/artifacts/journey-readiness' },
    mutation: { baseline: 'isolated', recoveryPoint: 'fixture-copy' },
    source: { archive: 'fixture-archive', artifact: 'fixture-build',
      revision: 'fixture-revision', tree: 'fixture-tree' },
    target: { host: 'mac', identity: 'fixture-target', topology: ['mac', 'iphone-simulator'] },
    ...overrides
  };
}
