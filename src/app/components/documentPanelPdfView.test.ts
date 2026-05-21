import { describe, expect, it, vi } from 'vitest';

vi.mock('./PdfDocumentSurface', () => ({
  PdfDocumentSurface: () => null
}));

import { resolvePdfDocumentSurface } from './documentPanelPdfView';

const pdfSourceDetails = {
  importRuns: [],
  importSource: {
    firstImportedAt: '2026-04-04T14:00:00.000Z',
    lastContentFingerprint: 'fingerprint-1',
    lastImportedAt: '2026-04-04T14:00:00.000Z',
    latestNodeId: 'node-1',
    pdfIndexStatus: 'ready' as const,
    pdfIndexedAt: '2026-04-04T14:00:02.000Z',
    provider: 'desktop_text_file',
    sourceFingerprint: 'source-1',
    sourceKind: 'pdf',
    sourceLocator: '/tmp/sample.pdf',
    sourceName: 'sample.pdf'
  },
  inheritedFromParent: false,
  keepImportItem: null,
  pdfPageDimensions: [],
  sourceNodeId: 'node-pdf-root'
};

describe('resolvePdfDocumentSurface', () => {
  it('returns null when active node is not the pdf source node itself', () => {
    const surface = resolvePdfDocumentSurface('node-highlight', false, pdfSourceDetails);
    expect(surface).toBeNull();
  });

  it('returns ready surface when active node is the pdf source node', () => {
    const surface = resolvePdfDocumentSurface('node-pdf-root', false, pdfSourceDetails);
    expect(surface).toEqual({ details: pdfSourceDetails, pdfIndexStatus: 'ready', sourceHint: '/tmp/sample.pdf', state: 'ready' });
  });

  it('uses the pdf import source instead of the keep markdown path for readwise pdf topics', () => {
    const surface = resolvePdfDocumentSurface('node-pdf-root', false, {
      ...pdfSourceDetails,
      importSource: {
        ...pdfSourceDetails.importSource,
        sourceLocator: 'foliole-asset://attachment/pdf-hash'
      },
      keepImportItem: {
        firstSeenAt: '2026-04-04T14:00:00.000Z',
        hasSourceUpdate: false,
        highlightPath: null,
        keepState: 'enabled',
        lastImportedAt: '2026-04-04T14:00:00.000Z',
        lastSeenAt: '2026-04-04T14:00:00.000Z',
        lastStatus: 'imported',
        localNodeState: 'active',
        primaryPath: '/tmp/readwise',
        resolvedSourcePath: '/tmp/readwise/面包机sd-P1000.md',
        ruleId: 'readwise-full',
        ruleLabel: 'Readwise articles',
        sourceMtimeMs: 1,
        sourcePath: '面包机sd-P1000.md',
        sourceSizeBytes: 305,
        sourceState: 'present',
        sourceType: 'readwise'
      }
    });

    expect(surface).toEqual(
      expect.objectContaining({
        sourceHint: 'foliole-asset://attachment/pdf-hash',
        state: 'ready'
      })
    );
  });
});
