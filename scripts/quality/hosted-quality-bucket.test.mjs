// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { parseHostedQualityBucket, runHostedQualityBucket } from './hosted-quality-bucket.mjs';

describe('hosted quality bucket', () => {
  it('accepts reviewed items in declared order for every owner', () => {
    expect(parseHostedQualityBucket('desktop-source', '["one","two"]').items).toEqual(['one', 'two']);
    expect(parseHostedQualityBucket('electron', '["database","import"]').items)
      .toEqual(['database', 'import']);
    expect(parseHostedQualityBucket('tooling', '["integration-one","node-preview"]').items)
      .toEqual(['integration-one', 'node-preview']);
  });

  it('rejects unknown owners, empty buckets, duplicates, and cross-owner items', () => {
    expect(() => parseHostedQualityBucket('unknown', '["one"]')).toThrow();
    expect(() => parseHostedQualityBucket('desktop-source', '[]')).toThrow();
    expect(() => parseHostedQualityBucket('electron', '["database","database"]')).toThrow();
    expect(() => parseHostedQualityBucket('tooling', '["database"]')).toThrow();
  });

  it('runs sequentially and fails closed at the exact item', () => {
    const runItem = vi.fn((_definition, item) => {
      if (item === 'two') throw new Error('two failed');
    });
    expect(() => runHostedQualityBucket('desktop-source', '["one","two","three"]', runItem))
      .toThrow('two failed');
    expect(runItem.mock.calls.map(([, item]) => item)).toEqual(['one', 'two']);
  });
});
