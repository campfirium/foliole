import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiOriginalFileState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import {
  loadReadwiseApiFrozenResources,
  saveReadwiseApiFrozenResources
} from '../database/readwiseApiFrozenResourceStage.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { ensureMacosFileSecurityScopedAccess } from '../macosFileSecurityBookmarks.js';

import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';
import {
  prepareReadwiseApiEpubCoverIfNeeded,
  prepareReadwiseApiEpubImagesIfNeeded
} from './readwiseApiEpubImagePreparation.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import {
  prepareReadwiseApiOriginalFile,
  stageReadwiseApiOriginalFile
} from './readwiseApiOriginalFile.js';
import { prepareOriginalEpubCandidate } from './readwiseOriginalEpubPreparation.js';
import { shouldRebuildPristineReadwiseEpub } from './readwiseSourceCutoverMerge.js';

export async function prepareReadwiseApiFrozenResources(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  destination: ReadwiseImportDestination;
  document: PreparedReadwiseApiDocument;
  requireFreshOriginalFile?: boolean;
}): Promise<ReadwiseApiPreparedResources> {
  const frozen = loadReadwiseApiFrozenResources(input.connectionRef, input.document.id);
  if (frozen && !frozen.preparationPending && !(input.requireFreshOriginalFile && input.document.category === 'epub'
    && !frozen.originalEpub)) return frozen;
  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  const destination = existing ? 'inbox' : input.destination;
  const forceEpubStructure = shouldRebuildPristineReadwiseEpub({
    connectionRef: input.connectionRef,
    document: input.document
  });
  const { originalEpub, originalFile } = await prepareOriginalResources(input, frozen, destination,
    existing?.state.originalFile ?? null);
  const epubImages = await prepareReadwiseApiEpubImagesIfNeeded({
    config: input.config,
    connectionRef: input.connectionRef,
    destination,
    document: input.document,
    forceEpubStructure
  });
  const epubCover = await prepareReadwiseApiEpubCoverIfNeeded({
    config: input.config,
    connectionRef: input.connectionRef,
    destination,
    document: input.document,
    forceEpubStructure
  });
  const resources: ReadwiseApiPreparedResources = {
    epubCover: frozen?.epubCover ?? epubCover,
    epubImages: frozen?.epubImages ?? epubImages,
    forceEpubStructure,
    originalFile: originalFile ? { bytes: null, state: originalFile.state } : null,
    ...(originalEpub ? { originalEpub } : {}),
    ...(input.requireFreshOriginalFile ? { replaceOriginalFile: true } : {})
  };
  input.dependencies.assertCutoverBatch?.();
  input.dependencies.signal?.throwIfAborted();
  assertFreshOriginalFile(input.requireFreshOriginalFile, originalFile);
  saveReadwiseApiFrozenResources(input.connectionRef, input.document.id, resources);
  return resources;
}

async function prepareOriginalResources(
  input: Parameters<typeof prepareReadwiseApiFrozenResources>[0],
  frozen: ReadwiseApiPreparedResources | null,
  destination: ReadwiseImportDestination,
  existingOriginalFile: ReadwiseApiOriginalFileState | null
) {
  const category = originalFileCategoryFor(input.document.category);
  const cachedOriginalFile = frozen?.originalFile?.state ?? (input.requireFreshOriginalFile ? null : existingOriginalFile);
  const restoredOriginalEpub = (input.requireFreshOriginalFile || frozen?.preparationPending) && input.document.category === 'epub'
    ? await prepareCachedOriginalEpub(cachedOriginalFile, input.document.title) : null;
  const originalFile = frozen?.originalFile?.state.status === 'localized'
    ? frozen.originalFile
    : restoredOriginalEpub && cachedOriginalFile
    ? { bytes: null, state: cachedOriginalFile }
    : category && destination === 'inbox'
      && (input.requireFreshOriginalFile || existingOriginalFile?.status !== 'localized')
    ? await prepareReadwiseApiOriginalFile({
      category, dependencies: input.dependencies, documentId: input.document.id,
      hasHtmlBody: Boolean(input.document.body.trim()),
      ...(input.document.rawSourceUrl === undefined ? {} : { rawSourceUrl: input.document.rawSourceUrl })
    }) : null;
  input.dependencies.assertCutoverBatch?.();
  input.dependencies.signal?.throwIfAborted();
  if (originalFile?.bytes && originalFile.state.status === 'localized') {
    await stageReadwiseApiOriginalFile({
      bytes: originalFile.bytes, category: category ?? 'pdf', state: originalFile.state,
      title: input.document.title,
      ...(input.dependencies.signal ? { signal: input.dependencies.signal } : {}),
      ...(input.dependencies.assertCutoverBatch ? { assertEligible: input.dependencies.assertCutoverBatch } : {})
    });
  }
  input.dependencies.assertCutoverBatch?.();
  input.dependencies.signal?.throwIfAborted();
  if (originalFile?.state.status === 'localized') saveReadwiseApiFrozenResources(input.connectionRef, input.document.id, {
    epubImages: null, originalFile: { bytes: null, state: originalFile.state }, preparationPending: true
  });
  const originalEpub = restoredOriginalEpub ?? (input.document.category === 'epub' && originalFile?.bytes
    && originalFile.state.status === 'localized'
    ? await prepareOriginalEpubCandidate({
      bytes: originalFile.bytes, now: new Date().toISOString(), title: input.document.title
    }) : frozen?.originalEpub);
  return { originalEpub, originalFile };
}

async function prepareCachedOriginalEpub(
  state: ReadwiseApiOriginalFileState | null | undefined,
  title: string
) {
  if (state?.status !== 'localized') return null;
  try {
    const storagePath = resolveAttachmentStoragePath(state.contentHash, undefined, state.mimeType);
    ensureMacosFileSecurityScopedAccess(path.dirname(storagePath));
    const bytes = await fs.readFile(storagePath);
    return prepareOriginalEpubCandidate({ bytes, now: new Date().toISOString(), title });
  } catch {
    return null;
  }
}

function originalFileCategoryFor(category: PreparedReadwiseApiDocument['category']) {
  return category === 'pdf' || category === 'epub' ? category : null;
}

function assertFreshOriginalFile(
  required: boolean | undefined,
  originalFile: Awaited<ReturnType<typeof prepareReadwiseApiOriginalFile>> | null
) {
  if (required && originalFile?.state.status !== 'localized') {
    throw new Error(originalFile?.state.reason ?? 'original_file_download_failed');
  }
}
