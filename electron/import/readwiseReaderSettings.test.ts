// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { normalizeReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

describe('normalizeReadwiseReaderConfig', () => {
  it('keeps the default behavior as only importing files with highlights', () => {
    expect(normalizeReadwiseReaderConfig(null)).toMatchObject({
      enabled: false,
      importScope: 'highlights_only',
      syncFrequency: 'hourly',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    });
  });

  it('normalizes the legacy highlights-only scope into destination settings', () => {
    expect(normalizeReadwiseReaderConfig({ importScope: 'highlights_only' })).toMatchObject({
      importScope: 'highlights_only',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    });
  });

  it('normalizes the legacy all scope into inbox destinations', () => {
    expect(normalizeReadwiseReaderConfig({ importScope: 'all' })).toMatchObject({
      importScope: 'all',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'inbox'
    });
  });

  it('keeps explicit destinations, enabled state, and sync frequency', () => {
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
      importScope: 'highlights_only',
      syncFrequency: 'every_12_hours',
      withHighlightsDestination: 'external',
      withoutHighlightsDestination: 'external'
    });
  });

  it('falls back safely for invalid destinations and frequency values', () => {
    expect(
      normalizeReadwiseReaderConfig({
        syncFrequency: 'manual',
        withHighlightsDestination: 'off',
        withoutHighlightsDestination: 'archive'
      })
    ).toMatchObject({
      syncFrequency: 'hourly',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
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
