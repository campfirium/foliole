export function createPassingProviders(overrides = {}) {
  const pass = (owner) => async () => ({ action: `${owner} proven`, missingFacts: [], status: 'passed' });
  return Object.fromEntries([
    'candidate', 'controller', 'adapter', 'baseline', 'criteria', 'evidence', 'cleanup'
  ].map((owner) => [owner, overrides[owner] ?? pass(owner)]));
}

export function localFixtureDefinition(overrides = {}) {
  return {
    candidate: { artifact: 'fixture-build', entrypoint: 'fixture-entry', revision: 'fixture-revision', tree: 'fixture-tree' },
    controller: { dependencies: 'fixture-dependencies', entrypoint: 'journey-readiness-cli', scenario: 'dry-run', topology: 'local' },
    adapter: { capabilities: ['isolated-root'], host: 'mac', topology: ['mac', 'iphone-simulator'] },
    baseline: { cleanupOwner: 'fixture', fixture: 'isolated', quiescent: true, recoveryPoint: 'fixture-copy' },
    criteria: { failure: 'fail-closed', humanIntervention: 'none', success: 'all-facts-passed' },
    evidence: { archiveOwner: 'fixture', root: '.tmp/artifacts/journey-readiness', writer: 'atomic-json' },
    cleanup: { complete: true, owner: 'fixture', strategy: 'exact-owned-resource' },
    ...overrides
  };
}
