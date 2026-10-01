import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ReadwiseApiOriginalFileState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadNodeResourceReferences, persistNodeResourceReference } from '../database/nodeResources.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from '../database/pdfIndexing.js';

import { fetchReadwiseRawSourceDocument, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { downloadReadwiseOriginalFile } from './readwiseOriginalFileDownload.js';

const PDF_MIME = 'application/pdf';
const EPUB_MIME = 'application/epub+zip';
type OriginalFileCategory = 'epub' | 'pdf';

export { downloadReadwiseOriginalFile } from './readwiseOriginalFileDownload.js';

export interface PreparedReadwiseOriginalFile {
  bytes: Uint8Array | null;
  state: ReadwiseApiOriginalFileState;
}

export async function prepareReadwiseApiOriginalFile(input: {
  category: OriginalFileCategory;
  documentId: string;
  hasHtmlBody: boolean;
  dependencies?: ReadwiseApiFetchDependencies;
  rawSourceUrl?: string | null;
}): Promise<PreparedReadwiseOriginalFile> {
  try {
    let rawSourceUrl = input.rawSourceUrl ?? null;
    if (!rawSourceUrl && input.rawSourceUrl === null && input.dependencies?.allowFolderModeForCutover) {
      return degraded(input.hasHtmlBody, 'original_file_not_distributed');
    }
    if (!rawSourceUrl) {
      rawSourceUrl = await refreshRawSourceUrl(input);
    }
    if (!rawSourceUrl) return degraded(input.hasHtmlBody, 'original_file_not_distributed');
    let bytes: Uint8Array;
    try {
      bytes = await downloadReadwiseOriginalFile(rawSourceUrl, input.category, input.dependencies);
    } catch (error) {
      if (!input.rawSourceUrl || !isExpiredOriginalFileUrl(error)) throw error;
      const refreshed = await refreshRawSourceUrl(input);
      if (!refreshed) return degraded(input.hasHtmlBody, 'original_file_not_distributed');
      bytes = await downloadReadwiseOriginalFile(refreshed, input.category, input.dependencies);
    }
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    return {
      bytes,
      state: {
        attachmentId: contentHash, contentHash, mimeType: mimeForCategory(input.category), reason: null,
        sizeBytes: bytes.byteLength, status: 'localized'
      }
    };
  } catch (error) {
    if (isAbortError(error) || isRetryableOriginalFileError(error)) throw error;
    return degraded(input.hasHtmlBody, originalFileFailureReason(error));
  }
}

async function refreshRawSourceUrl(input: {
  category: OriginalFileCategory;
  dependencies?: ReadwiseApiFetchDependencies;
  documentId: string;
}) {
  const document = await fetchReadwiseRawSourceDocument(input.documentId, input.dependencies);
  return document?.category === input.category ? document.rawSourceUrl : null;
}

function isExpiredOriginalFileUrl(error: unknown) {
  return error instanceof Error && (
    error.message === 'original_file_http_400'
    || error.message === 'original_file_http_401'
    || error.message === 'original_file_http_403'
  );
}

export async function persistReadwiseApiOriginalFile(input: {
  bytes: Uint8Array;
  category: OriginalFileCategory;
  nodeId: string;
  state: Extract<ReadwiseApiOriginalFileState, { status: 'localized' }>;
  title: string;
}) {
  await stageReadwiseApiOriginalFile(input);
  await runWithDatabaseConnectionOwner(() => {
    attachReadwiseApiOriginalFile(input.nodeId, input.state, input.title);
    if (input.category === 'pdf') {
      markPdfAttachmentIndexPending(input.state.attachmentId);
      enqueuePdfAttachmentIndexing(input.state.attachmentId);
    }
  });
}

export async function stageReadwiseApiOriginalFile(input: {
  bytes: Uint8Array;
  category?: OriginalFileCategory;
  signal?: AbortSignal;
  assertEligible?: () => void;
  state: Extract<ReadwiseApiOriginalFileState, { status: 'localized' }>;
  title: string;
}) {
  const storagePath = resolveAttachmentStoragePath(input.state.contentHash, undefined, input.state.mimeType);
  await persistValidatedFile(storagePath, input.bytes);
  input.signal?.throwIfAborted();
  await runWithDatabaseConnectionOwner(() => input.assertEligible?.());

}

export function attachReadwiseApiOriginalFile(
  nodeId: string,
  state: Extract<ReadwiseApiOriginalFileState, { status: 'localized' }>,
  title: string
) {
  const storageKey = buildCanonicalAttachmentStorageKey(state.contentHash, state.mimeType);
  if (!storageKey) throw new Error('original_file_identity_invalid');
  const existing = loadNodeResourceReferences(nodeId).find((reference) => reference.storage_key === storageKey && reference.role === 'reference');
  persistNodeResourceReference(nodeId, { storage_key: storageKey, role: 'reference',
    original_name: existing?.original_name ?? `${safeFileStem(title)}.${state.mimeType === PDF_MIME ? 'pdf' : 'epub'}` });
}

async function persistValidatedFile(storagePath: string, bytes: Uint8Array) {
  try {
    const existing = await fs.readFile(storagePath);
    if (createHash('sha256').update(existing).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) {
      throw new Error('original_file_hash_mismatch');
    }
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, bytes, { flag: 'wx' });
}

function degraded(hasHtmlBody: boolean, reason: string): PreparedReadwiseOriginalFile {
  return { bytes: null, state: { attachmentId: null, contentHash: null, mimeType: null, reason, sizeBytes: null,
    status: hasHtmlBody ? 'html_only' : 'unavailable' } };
}

function originalFileFailureReason(error: unknown) {
  return error instanceof Error && /^original_file_/u.test(error.message) ? error.message : 'original_file_download_failed';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isRetryableOriginalFileError(error: unknown) {
  return error instanceof Error && error.message === 'original_file_download_stalled';
}

function safeFileStem(value: string) {
  return value.replace(/[\\/:*?"<>|]/gu, '-').trim().slice(0, 120) || 'Readwise original';
}

function mimeForCategory(category: OriginalFileCategory) {
  return category === 'pdf' ? PDF_MIME : EPUB_MIME;
}
