// @vitest-environment node
/* global AbortController */

import { describe, expect, it, vi } from 'vitest';

import { enforceJourneyReadiness } from './journey-readiness-contract.mjs';
import { runJourneyQualification } from './journey-readiness-controller.mjs';
import { createPassingProviders, localFixtureDefinition } from './journey-readiness-fixture.mjs';

function blocked(reason, status = 'blocked') {
  return async () => ({ action: null, missingFacts: [reason], status });
}

async function qualify(overrides = {}, options = {}) {
  return runJourneyQualification({
    definition: localFixtureDefinition(),
    locator: 'receipt.json',
    providers: createPassingProviders(overrides),
    timeoutMs: options.timeoutMs ?? 20,
    writeReceipt: options.writeReceipt ?? vi.fn()
  });
}

describe('journey readiness fail-closed behavior', () => {
  it.each([
    ['candidate', 'uncommitted candidate'],
    ['controller', 'controller process exited'],
    ['adapter', 'resource occupied'],
    ['baseline', 'writes still active'],
    ['criteria', 'failure criterion missing'],
    ['evidence', 'archive unavailable'],
    ['cleanup', 'owned resource cleanup incomplete']
  ])('blocks readiness when %s cannot prove its fact', async (owner, reason) => {
    const receipt = await qualify({ [owner]: blocked(reason) });

    expect(receipt.status).toBe('blocked');
    expect(receipt.summary.failedOwners).toContain(owner);
    expect(() => enforceJourneyReadiness(receipt, localFixtureDefinition())).toThrow('is blocked');
  });

  it('invalidates instead of blocking when a frozen fact changes during qualification', async () => {
    const receipt = await qualify({ candidate: blocked('candidate changed', 'invalidated') });

    expect(receipt.status).toBe('invalidated');
  });

  it('blocks unknown provider output, cancellation, timeout, and process failure', async () => {
    const unknown = await qualify({ adapter: async () => ({ status: 'unknown' }) });
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runJourneyQualification({
      definition: localFixtureDefinition(), locator: 'receipt.json',
      providers: createPassingProviders(), signal: controller.signal, writeReceipt: vi.fn()
    });
    const timedOut = await qualify({ adapter: () => new Promise(() => {}) }, { timeoutMs: 1 });
    const exited = await qualify({ controller: async () => { throw new Error('process exited 9'); } });

    for (const receipt of [unknown, cancelled, timedOut, exited]) expect(receipt.status).toBe('blocked');
  });

  it('blocks a missing, ambiguous, or offline host adapter', async () => {
    const missingProviders = createPassingProviders();
    delete missingProviders.adapter;
    const missing = await runJourneyQualification({
      definition: localFixtureDefinition(), locator: 'receipt.json',
      providers: missingProviders, writeReceipt: vi.fn()
    });
    const ambiguous = await qualify({ adapter: [blocked('first'), blocked('second')] });
    const offline = await qualify({ adapter: blocked('host offline') });

    for (const receipt of [missing, ambiguous, offline]) {
      expect(receipt.status).toBe('blocked');
      expect(receipt.summary.failedOwners).toContain('adapter');
    }
  });

  it('downgrades an otherwise ready result when receipt persistence fails', async () => {
    const receipt = await qualify({}, {
      writeReceipt: async () => { throw new Error('disk full'); }
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.summary.failedOwners).toContain('evidence');
    expect(receipt.locator).toBeNull();
  });
});
