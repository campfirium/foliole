export function createPassingProviders(overrides = {}) {
  const pass = (owner) => async () => ({ action: `${owner} proven`, missingFacts: [], status: 'passed' });
  return Object.fromEntries([
    'candidate', 'controller', 'adapter', 'baseline', 'criteria', 'evidence', 'cleanup'
  ].map((owner) => [owner, overrides[owner] ?? pass(owner)]));
}

export function localFixtureDefinition(overrides = {}) {
  return {
    action: { id: 'fixture-readiness', scenario: 'dry-run' },
    cleanup: { complete: true, owner: 'fixture', strategy: 'exact-owned-resource' },
    mutation: { baseline: 'isolated', recoveryPoint: 'fixture-copy' },
    source: { artifact: 'fixture-build', revision: 'fixture-revision', tree: 'fixture-tree' },
    target: { host: 'mac', identity: 'fixture-target', topology: ['mac', 'iphone-simulator'] },
    ...overrides
  };
}
