// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  parseHostedAcceptanceBucket,
  runHostedAcceptanceBucket
} from './ios-hosted-acceptance-bucket.mjs';

describe('iOS hosted acceptance bucket', () => {
  it('delegates every bucket entry to the canonical isolated scenario runner', () => {
    const source = fs.readFileSync('scripts/ios/ios-hosted-acceptance-bucket.mjs', 'utf8');
    expect(source).toContain("scripts/ios/ios-bootstrap-acceptance.mjs");
    expect(source).toContain('FOLIOLE_IOS_ACCEPTANCE_SCENARIO: scenario');
  });

  it('accepts one or two reviewed scenarios in declared order', () => {
    expect(parseHostedAcceptanceBucket('["sync-pack-runtime"]')).toEqual(['sync-pack-runtime']);
    expect(parseHostedAcceptanceBucket(
      '["pairing-signed-transport","content-resource-read"]'
    )).toEqual(['pairing-signed-transport', 'content-resource-read']);
  });

  it('rejects empty, oversized, duplicate, and unknown buckets', () => {
    for (const value of [
      '[]',
      '["pairing-signed-transport","content-resource-read","sync-pack-runtime"]',
      '["sync-pack-runtime","sync-pack-runtime"]',
      '["database-upgrade-runtime"]',
      '["unknown"]'
    ]) expect(() => parseHostedAcceptanceBucket(value)).toThrow();
  });

  it('runs scenarios sequentially and stops the bucket on the first failure', () => {
    const calls = [];
    const failure = new Error('scenario failed');
    const runScenario = vi.fn((scenario) => {
      calls.push(scenario);
      if (scenario === 'pairing-signed-transport') throw failure;
    });

    expect(() => runHostedAcceptanceBucket([
      'pairing-signed-transport', 'content-resource-read'
    ], runScenario)).toThrow(failure);
    expect(calls).toEqual(['pairing-signed-transport']);
  });
});
