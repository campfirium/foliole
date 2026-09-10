import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ReadwiseApiOriginalFileState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { buildAttachmentStorageFileName } from '../attachments/storagePath.js';
import { upsertAttachmentBlobManifest } from '../database/attachmentBlobs.js';
import { createAttachmentRecord, createNodeAttachmentLink, findAttachmentRecordById } from '../database/attachments.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from '../database/pdfIndexing.js';

import { fetchReadwiseRawSourceDocument, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';

const MAX_ORIGINAL_FILE_BYTES = 100 * 1024 * 1024;
const PDF_MIME = 'application/pdf';

export interface PreparedReadwiseOriginalFile {
  bytes: Uint8Array | null;
  state: ReadwiseApiOriginalFileState;
}

export async function prepareReadwiseApiOriginalFile(input: {
  category: 'pdf';
  documentId: string;
  hasHtmlBody: boolean;
  dependencies?: ReadwiseApiFetchDependencies;
}): Promise<PreparedReadwiseOriginalFile> {
  try {
    const document = await fetchReadwiseRawSourceDocument(input.documentId, input.dependencies);
    if (!document?.rawSourceUrl || document.category !== input.category) {
      return degraded(input.hasHtmlBody, 'original_file_not_distributed');
    }
    const bytes = await downloadOriginalFile(document.rawSourceUrl, input.dependencies);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    return {
      bytes,
      state: {
        attachmentId: contentHash, contentHash, mimeType: PDF_MIME, reason: null,
        sizeBytes: bytes.byteLength, status: 'localized'
      }
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return degraded(input.hasHtmlBody, originalFileFailureReason(error));
  }
}

export async function persistReadwiseApiOriginalFile(input: {
  bytes: Uint8Array;
  category: 'pdf';
  nodeId: string;
  state: Extract<ReadwiseApiOriginalFileState, { status: 'localized' }>;
  title: string;
}) {
  const originalName = `${safeFileStem(input.title)}.pdf`;
  const existing = findAttachmentRecordById(input.state.attachmentId);
  const storagePath = resolveAttachmentStoragePath(input.state.contentHash, undefined, input.state.mimeType);
  await persistValidatedFile(storagePath, input.bytes);
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  if (!existing) {
    createAttachmentRecord({
      createdAt, id: input.state.attachmentId, mimeType: input.state.mimeType,
      originalName, sizeBytes: input.state.sizeBytes
    });
  }
  upsertAttachmentBlobManifest({
    attachmentId: input.state.attachmentId, availability: 'local', cachedAt: createdAt,
    contentHash: input.state.contentHash, createdAt, lastVerifiedAt: createdAt,
    mimeType: input.state.mimeType, sizeBytes: input.state.sizeBytes,
    sourceHostName: null, storageKey: buildAttachmentStorageFileName(input.state.contentHash, input.state.mimeType)
  });
  createNodeAttachmentLink({ attachmentId: input.state.attachmentId, nodeId: input.nodeId, role: 'reference' });
  markPdfAttachmentIndexPending(input.state.attachmentId);
  enqueuePdfAttachmentIndexing(input.state.attachmentId);
}

async function downloadOriginalFile(
  initialUrl: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let url = requireS3Url(initialUrl);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'manual', ...(dependencies.signal ? { signal: dependencies.signal } : {})
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('original_file_redirect_invalid');
      url = requireS3Url(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`original_file_http_${response.status}`);
    validateDeclaredMime(response.headers.get('content-type'));
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_ORIGINAL_FILE_BYTES) {
      throw new Error('original_file_too_large');
    }
    const bytes = await readBoundedBody(response.body, dependencies.signal);
    validateFileBytes(bytes);
    return bytes;
  }
  throw new Error('original_file_redirect_limit');
}

async function readBoundedBody(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException('Readwise import cancelled', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ORIGINAL_FILE_BYTES) {
      await reader.cancel();
      throw new Error('original_file_too_large');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function validateDeclaredMime(value: string | null) {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  const allowed = new Set(['application/pdf', 'application/octet-stream']);
  if (mime && !allowed.has(mime)) throw new Error('original_file_mime_mismatch');
}

function validateFileBytes(bytes: Uint8Array) {
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512)));
  const valid = prefix.subarray(0, 5).toString() === '%PDF-';
  if (!valid) throw new Error('original_file_signature_mismatch');
}

function requireS3Url(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !(host === 's3.amazonaws.com' || host.endsWith('.amazonaws.com'))) {
    throw new Error('original_file_url_rejected');
  }
  return url.toString();
}

async function persistValidatedFile(storagePath: string, bytes: Uint8Array) {
  try { await fs.access(storagePath); return; } catch { /* create below */ }
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

function safeFileStem(value: string) {
  return value.replace(/[\\/:*?"<>|]/gu, '-').trim().slice(0, 120) || 'Readwise original';
}
