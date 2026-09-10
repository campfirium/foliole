// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { normalizeReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

describe('normalizeReadwiseReaderConfig', () => {
  it('keeps parser and schedule defaults independent from automatic import policy', () => {
    expect(normalizeReadwiseReaderConfig(null)).toMatchObject({
      enabled: false,
      importScope: 'highlights_only',
      syncFrequency: 'hourly'
    });
  });

  it('preserves the parser import scope without deriving destinations', () => {
    expect(normalizeReadwiseReaderConfig({ importScope: 'all' })).toMatchObject({
      importScope: 'all'
    });
  });

  it('drops legacy destinations while keeping enabled state and sync frequency', () => {
    expect(
      normalizeReadwiseReaderConfig({
        enabled: true,
        importScope: 'all',
        syncFrequency: 'every_12_hours',
        withHighlightsDestination: 'external',
        withoutHighlightsDestination: 'external'
      })
    ).toMatchObject({
      enabled: true,
      importScope: 'all',
      syncFrequency: 'every_12_hours'
    });
    expect(normalizeReadwiseReaderConfig({ withHighlightsDestination: 'external' }))
      .not.toHaveProperty('withHighlightsDestination');
  });

  it('falls back safely for an invalid frequency value', () => {
    expect(
      normalizeReadwiseReaderConfig({
        syncFrequency: 'manual',
        withHighlightsDestination: 'off',
        withoutHighlightsDestination: 'archive'
      })
    ).toMatchObject({
      syncFrequency: 'hourly'
    });
  });
});

describe('normalizeReadwiseReaderConfig enabled migration', () => {
  it('applies the enabled fallback only when the payload has no explicit enabled state', () => {
    expect(normalizeReadwiseReaderConfig({}, { enabledFallback: true }).enabled).toBe(true);
    expect(
      normalizeReadwiseReaderConfig({ enabled: false }, { enabledFallback: true }).enabled
    ).toBe(false);
  });
});

describe('normalizeImportManagerSettings', () => {
  it('migrates legacy enabled Readwise article sources into the reader config', () => {
    const normalized = normalizeImportManagerSettings({
      readwiseReaderConfig: {
        importScope: 'highlights_only'
      },
      readwiseSources: [
        {
          id: 'draft-import-source-1',
          kind: 'articles',
          keepState: 'enabled'
        }
      ]
    });

    expect(normalized.readwiseReaderConfig.enabled).toBe(true);
  });

  it('keeps Readwise import disabled when there is no legacy enabled articles source', () => {
    expect(normalizeImportManagerSettings({}).readwiseReaderConfig.enabled).toBe(false);
  });
});
