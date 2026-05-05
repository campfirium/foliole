// @vitest-environment node

import { expect, it, vi } from 'vitest';

const { loadNodeSourceDetails } = vi.hoisted(() => ({
  loadNodeSourceDetails: vi.fn()
}));
const { listNodeAttachments } = vi.hoisted(() => ({
  listNodeAttachments: vi.fn()
}));
const { resolveAttachmentFile } = vi.hoisted(() => ({
  resolveAttachmentFile: vi.fn()
}));

vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails }));
vi.mock('../database/attachments.js', () => ({ listNodeAttachments }));
vi.mock('../attachments/resourceResolver.js', () => ({ resolveAttachmentFile }));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(() => ({ readwiseSources: [], sources: [] }))
}));

import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';

it('serializes pdf attachment sources as file URLs for the desktop PDF reader', () => {
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
      source_locator: 'foliole-asset://attachment/pdf-hash',
      source_name: 'paper.pdf'
    },
    inheritedFromParent: false,
    keepImportItem: null,
    pdfPageDimensions: [],
    sourceNodeId: 'node-1'
  });
  listNodeAttachments.mockReturnValue([
    {
      attachmentId: 'pdf-hash',
      role: 'reference',
      attachment: { mimeType: 'application/pdf' }
    }
  ]);
  resolveAttachmentFile.mockReturnValue({
    filePath: '/tmp/foliole-assets/pdf-hash.pdf',
    mimeType: 'application/pdf',
    status: 'ready'
  });

  expect(toNativeNodeSourceDetails('node-1')?.import_source).toEqual(
    expect.objectContaining({
      source_kind: 'pdf',
      source_locator: 'file:///tmp/foliole-assets/pdf-hash.pdf',
      source_name: 'paper.pdf'
    })
  );
});
