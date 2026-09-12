// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadNodeSourceDetails } = vi.hoisted(() => ({
  loadNodeSourceDetails: vi.fn()
}));
const { listNodeAttachments } = vi.hoisted(() => ({
  listNodeAttachments: vi.fn()
}));
const { loadAttachmentResourceDescription } = vi.hoisted(() => ({
  loadAttachmentResourceDescription: vi.fn()
}));

const PDF_CONTENT_HASH = 'a'.repeat(64);
const PDF_STORAGE_KEY = `${PDF_CONTENT_HASH}.pdf`;
const PDF_RESOURCE_URL = `foliole-asset://attachment/${PDF_STORAGE_KEY}`;

vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails }));
vi.mock('../database/attachments.js', () => ({ listNodeAttachments }));
vi.mock('../database/attachmentResourceDescription.js', () => ({ loadAttachmentResourceDescription }));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn(() => ({ readwiseSources: [], sources: [] }))
}));

import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';

beforeEach(() => {
  vi.clearAllMocks();
  loadAttachmentResourceDescription.mockReturnValue({
    attachmentId: 'pdf-hash',
    availability: 'local',
    contentHash: PDF_CONTENT_HASH,
    libraryScope: 'library-scope',
    mimeType: 'application/pdf',
    storageKey: PDF_STORAGE_KEY
  });
});

function mockPdfSource(sourceLocator: string) {
  const value = {
    importRuns: [],
    importSource: {
      first_imported_at: '2026-04-29T00:00:00.000Z',
      last_content_fingerprint: 'content-1',
      last_imported_at: '2026-04-29T00:00:00.000Z',
      latest_node_id: 'node-1',
      provider: 'desktop_text_file',
      remote_import_state_json: '{}',
      source_fingerprint: 'source-1',
      source_kind: 'pdf',
      source_locator: sourceLocator,
      source_name: 'paper.pdf'
    },
    inheritedFromParent: false,
    keepImportItem: null,
    pdfPageDimensions: [],
    sourceNodeId: 'node-1'
  };
  loadNodeSourceDetails.mockReturnValue(value);
  return value;
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
      source_locator: PDF_RESOURCE_URL,
      source_name: 'paper.pdf'
    })
  );
});

it('exposes a synced Readwise original-file result without its transient URL', () => {
  const details = mockPdfSource('readwise://document/document-1');
  loadNodeSourceDetails.mockReturnValue({
    ...details,
    importSource: {
      ...details.importSource,
      remote_import_state_json: JSON.stringify({
        originalFile: {
          attachmentId: null, contentHash: null, mimeType: null,
          reason: 'original_file_not_distributed', sizeBytes: null, status: 'html_only'
        }
      })
    }
  });
  listNodeAttachments.mockReturnValue([]);
  expect(toNativeNodeSourceDetails('node-1')?.import_source).toMatchObject({
    readwise_original_file: {
      attachment_id: null, reason: 'original_file_not_distributed', status: 'html_only'
    }
  });
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
      source_locator: PDF_RESOURCE_URL
    })
  );
});
