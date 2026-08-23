// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { enforceJourneyReadiness } from './journey-readiness-contract.mjs';
import { runJourneyQualification } from './journey-readiness-controller.mjs';
import { createPassingProviders, localFixtureDefinition } from './journey-readiness-fixture.mjs';

async function readyReceipt(definition = localFixtureDefinition()) {
  return runJourneyQualification({
    definition,
    locator: '.tmp/artifacts/journey-readiness/test/receipt.json',
    now: vi.fn().mockReturnValueOnce('start').mockReturnValue('complete'),
    providers: createPassingProviders(),
    writeReceipt: vi.fn()
  });
}

describe('journey readiness contract', () => {
  it('creates a ready receipt only after every trust owner passes', async () => {
    const definition = localFixtureDefinition();
    const receipt = await readyReceipt(definition);

    expect(receipt.status).toBe('ready');
    expect(receipt.facts.map((fact) => fact.owner)).toEqual([
      'source', 'action', 'target', 'mutation', 'integrity', 'cleanup', 'locator'
    ]);
    expect(receipt.locator).toContain('journey-readiness/test/receipt.json');
    expect(enforceJourneyReadiness(receipt, definition)).toBe(receipt);
  });

  it.each([
    ['source', { revision: 'changed' }],
    ['action', { scenario: 'changed' }],
    ['target', { identity: 'changed' }],
    ['mutation', { baseline: 'changed' }],
    ['integrity', { data: 'changed' }],
    ['cleanup', { strategy: 'changed' }],
    ['locator', { kind: 'changed' }]
  ])('rejects an old receipt when the %s provenance changes', async (owner, change) => {
    const definition = localFixtureDefinition();
    const receipt = await readyReceipt(definition);
    const changed = localFixtureDefinition({ [owner]: { ...definition[owner], ...change } });

    expect(() => enforceJourneyReadiness(receipt, changed)).toThrow(`provenance changed: ${owner}`);
  });

  it('does not let business criteria or controller digests define readiness', async () => {
    const receipt = await readyReceipt();

    expect(receipt.provenance).not.toHaveProperty('criteria');
    expect(receipt.provenance).not.toHaveProperty('controller');
    expect(receipt.facts.map((fact) => fact.owner)).not.toEqual(expect.arrayContaining([
      'criteria', 'controller'
    ]));
  });

  it('rejects historical v2 receipts that still use the mixed seven-provider contract', async () => {
    const receipt = await readyReceipt();
    receipt.facts = receipt.facts.map((fact, index) => ({ ...fact,
      owner: ['candidate', 'controller', 'adapter', 'baseline', 'criteria', 'evidence', 'cleanup'][index] }));

    expect(() => enforceJourneyReadiness(receipt, localFixtureDefinition()))
      .toThrow('trust facts are unsupported');
  });

  it('does not accept review state or a ready word in place of a receipt', () => {
    expect(() => enforceJourneyReadiness({ reviewGate: 'confirmed', status: 'ready' }, localFixtureDefinition()))
      .toThrow('schema is unsupported');
  });
});
