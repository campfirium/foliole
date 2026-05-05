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
  sourceNodeId: 'node-pdf-root'
};

describe('resolvePdfDocumentSurface', () => {
  it('returns null when active node is not the pdf source node itself', () => {
    const surface = resolvePdfDocumentSurface('node-highlight', false, pdfSourceDetails);
    expect(surface).toBeNull();
  });

  it('returns ready surface when active node is the pdf source node', () => {
    const surface = resolvePdfDocumentSurface('node-pdf-root', false, pdfSourceDetails);
    expect(surface).toEqual({ pdfIndexStatus: 'ready', sourceHint: '/tmp/sample.pdf', state: 'ready' });
  });
});
