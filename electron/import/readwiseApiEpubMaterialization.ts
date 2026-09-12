import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import {
  type PreparedReadwiseApiAnnotation,
  type PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import type { ReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { READWISE_API_IMPORT_STATE_VERSION } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { buildPreparedImportRecord } from '../ipc/importSourcePipeline.js';

import { placeReadwiseApiEpubAnnotations } from './readwiseApiEpubAnnotationPlacement.js';
import {
  filterRelocatableAnnotations,
  mergeRelocatedAnnotationStates
} from './readwiseApiEpubAnnotationRelocation.js';
import {
  buildReadwiseApiEpubBookNodes,
  persistReadwiseApiEpubBookNodes
} from './readwiseApiEpubBookTree.js';
import { replaceReadwiseApiEpubImageLinks } from './readwiseApiEpubImageLinks.js';
import type { PreparedReadwiseApiEpubImages } from './readwiseApiEpubImages.js';

interface BodyNode extends NodeBodyRow {
  created_at: string;
  id: string;
}

export function hasPersistedReadwiseApiEpubStructure(rootNodeId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
     `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT child.id FROM nodes child JOIN descendants ON child.parent_id = descendants.id
       WHERE child.deleted_at IS NULL
     ) SELECT id FROM descendants WHERE id LIKE 'node-epub-%' LIMIT 1`, [rootNodeId]
  ));
}

export function materializeReadwiseApiEpub(input: {
  annotationStates: ReadwiseApiAnnotationState[];
  connectionRef: string;
  document: PreparedReadwiseApiDocument;
  existingSourceFingerprint: string | null;
  importedAt: string;
  newAnnotations: PreparedReadwiseApiAnnotation[];
  previousState: ReadwiseApiDocumentImportState | null;
  preparedImages?: PreparedReadwiseApiEpubImages | null | undefined;
  relocationPolicy: 'first' | 'unique';
  rebuildRoot: boolean;
  rootNodeId: string | null;
}) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    const rootNodeId = input.rootNodeId && !input.rebuildRoot ? input.rootNodeId : createBookTree(input);
    const bodies = readReadwiseApiEpubBookBodies(rootNodeId);
    const relocatable = filterRelocatableAnnotations(input.newAnnotations, input.annotationStates);
    const placed = placeReadwiseApiEpubAnnotations({
      annotations: relocatable, annotationStates: input.annotationStates, bodies,
      connectionRef: input.connectionRef, documentId: input.document.id,
      importedAt: input.importedAt, relocationPolicy: input.relocationPolicy, rootNodeId
    });
    const nextStates = mergeRelocatedAnnotationStates({
      annotations: relocatable, connectionRef: input.connectionRef, states: input.annotationStates
    });
    const sourceFingerprint = input.existingSourceFingerprint ?? readSourceFingerprint(rootNodeId);
    saveReadwiseApiImportSource({
      annotationsJson: JSON.stringify(nextStates.map(({ kind, nodeId, remoteId }) => ({ kind, nodeId, remoteId }))),
      connectionRef: input.connectionRef,
      documentId: input.document.id,
      sourceFingerprint,
      state: {
        annotations: nextStates,
        bodyAuthority: input.previousState?.bodyAuthority ?? 'reader_html',
        bodyState: 'materialized',
        documentBlockedAt: null,
        metadata: input.document.metadata,
        originalFile: input.previousState?.originalFile ?? null,
        remoteLifecycle: input.previousState?.remoteLifecycle ?? null,
        sourceUpdate: input.previousState?.sourceUpdate ?? null,
        sourceUpdatedAt: input.document.updatedAt,
        version: READWISE_API_IMPORT_STATE_VERSION
      },
      updatedAt: input.importedAt
    });
    return { annotationCount: placed, documentId: input.document.id, status: 'imported' as const };
  });
}

function createBookTree(input: Parameters<typeof materializeReadwiseApiEpub>[0]) {
  const structure = input.document.epubStructure;
  if (!structure) throw new Error('readwise_epub_structure_missing');
  const projectedStructure = input.preparedImages ?? {
    degradedReason: structure.degradedReason,
    rootAttachmentIds: [],
    rootBody: structure.rootBody,
    sections: structure.sections
  };
  const preparedRoot = buildPreparedImportRecord({
    filePath: remoteLocator(input.document.id), kind: 'html', sourceName: `${input.document.title}.html`
  }, {
    content: buildRootContent(
      input.document,
      structure.sections.length ? projectedStructure.rootBody : input.document.body
    ),
    degradedReason: appendReason(structure.degradedReason, projectedStructure.degradedReason),
    highlightPolicy: 'reference_only',
    hideTitleHeadingOverride: false,
    importedAt: input.importedAt,
    nodeTitleOverride: input.document.title,
    sourceIdentity: `readwise/api/${input.connectionRef}/${input.document.id}`,
    sourceLocator: remoteLocator(input.document.id),
    sourceProfile: 'body_with_highlight_sidecar'
  });
  if (input.existingSourceFingerprint) preparedRoot.sourceFingerprint = input.existingSourceFingerprint;
  const root = runPreparedImport(
    preparedRoot,
    input.rootNodeId ? { forceUpdateExistingNodeId: input.rootNodeId, resetImportedStructure: true } : undefined
  );
  if (!root.nodeId) throw new Error('readwise_epub_root_missing');
  replaceReadwiseApiEpubImageLinks(root.nodeId, projectedStructure.rootAttachmentIds);
  persistReadwiseApiEpubBookNodes({
    connectionRef: input.connectionRef,
    documentId: input.document.id,
    importedAt: input.importedAt,
    nodes: buildReadwiseApiEpubBookNodes(projectedStructure.sections),
    rootNodeId: root.nodeId
  });
  return root.nodeId;
}

export function readReadwiseApiEpubBookBodies(rootNodeId: string) {
  const rows = openDatabaseConnection().driver.queryAll<BodyNode>(
    `WITH RECURSIVE descendants(id, content, body_blob_hash, created_at) AS (
       SELECT id, content, body_blob_hash, created_at FROM nodes WHERE id = ? AND deleted_at IS NULL
       UNION ALL SELECT child.id, child.content, child.body_blob_hash, child.created_at FROM nodes child
       JOIN descendants ON child.parent_id = descendants.id WHERE child.deleted_at IS NULL
     ) SELECT d.id, d.content, d.body_blob_hash, d.created_at, cbd.data body_blob_data
     FROM descendants d LEFT JOIN content_blob_data cbd ON cbd.hash = d.body_blob_hash
     ORDER BY CASE WHEN d.id = ? THEN 0 ELSE 1 END, d.created_at, d.id`, [rootNodeId, rootNodeId]
  );
  return rows.filter((row) => (
    row.id === rootNodeId
    || row.id.startsWith('node-epub-')
  ))
    .map((row) => ({ id: row.id, content: requireResolvedNodeBody(row, row.id).content }));
}

function buildRootContent(document: PreparedReadwiseApiDocument, rootBody = document.epubStructure?.rootBody) {
  const links = [
    document.metadata.readerUrl ? `[Open in Reader](${document.metadata.readerUrl})` : null,
    document.metadata.sourceUrl ? `[Open source](${document.metadata.sourceUrl})` : null
  ].filter(Boolean).join(' · ');
  return [`# ${document.title}`, rootBody, links].filter(Boolean).join('\n\n');
}

function appendReason(first: string | null, second: string | null | undefined) {
  return [first, second].filter(Boolean).join(' | ') || null;
}

function readSourceFingerprint(rootNodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ source_fingerprint: string }>(
    'SELECT source_fingerprint FROM import_sources WHERE latest_node_id = ?', [rootNodeId]
  );
  if (!row) throw new Error('readwise_epub_import_source_missing');
  return row.source_fingerprint;
}

function remoteLocator(documentId: string) {
  return `readwise://document/${encodeURIComponent(documentId)}`;
}
