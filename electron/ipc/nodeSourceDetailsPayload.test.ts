// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadNodeSourceDetails } = vi.hoisted(() => ({
  loadNodeSourceDetails: vi.fn()
}));
const { listNodeAttachments } = vi.hoisted(() => ({
  listNodeAttachments: vi.fn()
}));

vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails }));
vi.mock('../database/attachments.js', () => ({ listNodeAttachments }));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(() => ({ readwiseSources: [], sources: [] }))
}));

import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockPdfSource(sourceLocator: string) {
  loadNodeSourceDetails.mockReturnValue({
    importRuns: [],
    importSource: {
      first_imported_at: '2026-04-29T00:00:00.000Z',
      last_content_fingerprint: 'content-1',
      last_imported_at: '2026-04-29T00:00:00.000Z',
      latest_node_id: 'node-1',
      provider: 'desktop_text_file',
      source_fingerprint: 'source-1',
      source_kind: 'pdf',
      source_locator: sourceLocator,
      source_name: 'paper.pdf'
    },
    inheritedFromParent: false,
    keepImportItem: null,
    pdfPageDimensions: [],
    sourceNodeId: 'node-1'
  });
}

it('serializes pdf attachment sources through the managed attachment protocol for the desktop PDF reader', () => {
  mockPdfSource('foliole-asset://attachment/pdf-hash');
  listNodeAttachments.mockReturnValue([
    {
      attachmentId: 'pdf-hash',
      role: 'reference',
      attachment: { mimeType: 'application/pdf' }
    }
  ]);

  expect(toNativeNodeSourceDetails('node-1')?.import_source).toEqual(
    expect.objectContaining({
      source_kind: 'pdf',
      source_locator: 'foliole-asset://attachment/pdf-hash',
      source_name: 'paper.pdf'
    })
  );
});

it('keeps pdf reader sources on the managed attachment copy even when the import source has an original file path', () => {
  mockPdfSource('/tmp/foliole-source-details-payload-source.pdf');
  listNodeAttachments.mockReturnValue([
    {
      attachmentId: 'pdf-hash',
      role: 'reference',
      attachment: { mimeType: 'application/pdf' }
    }
  ]);

  expect(toNativeNodeSourceDetails('node-1')?.import_source).toEqual(
    expect.objectContaining({
      source_kind: 'pdf',
      source_locator: 'foliole-asset://attachment/pdf-hash'
    })
  );
});
