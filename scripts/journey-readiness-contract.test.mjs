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
  it('creates a ready receipt only after every independent owner passes', async () => {
    const definition = localFixtureDefinition();
    const receipt = await readyReceipt(definition);

    expect(receipt.status).toBe('ready');
    expect(receipt.facts.map((fact) => fact.owner)).toEqual([
      'candidate', 'controller', 'adapter', 'baseline', 'criteria', 'evidence', 'cleanup'
    ]);
    expect(receipt.locator).toContain('journey-readiness/test/receipt.json');
    expect(enforceJourneyReadiness(receipt, definition)).toBe(receipt);
  });

  it.each([
    ['source', { revision: 'changed' }],
    ['action', { scenario: 'changed' }],
    ['target', { identity: 'changed' }],
    ['mutation', { baseline: 'changed' }],
    ['cleanup', { strategy: 'changed' }]
  ])('rejects an old receipt when the %s provenance changes', async (owner, change) => {
    const definition = localFixtureDefinition();
    const receipt = await readyReceipt(definition);
    const changed = localFixtureDefinition({ [owner]: { ...definition[owner], ...change } });

    expect(() => enforceJourneyReadiness(receipt, changed)).toThrow(`provenance changed: ${owner}`);
  });

  it('records journey criteria and evidence as facts instead of global provenance', async () => {
    const receipt = await readyReceipt();

    expect(receipt.provenance).not.toHaveProperty('criteria');
    expect(receipt.provenance).not.toHaveProperty('evidence');
    expect(receipt.facts.map((fact) => fact.owner)).toEqual(expect.arrayContaining([
      'criteria', 'evidence'
    ]));
  });

  it('does not accept review state or a ready word in place of a receipt', () => {
    expect(() => enforceJourneyReadiness({ reviewGate: 'confirmed', status: 'ready' }, localFixtureDefinition()))
      .toThrow('schema is unsupported');
  });
});
