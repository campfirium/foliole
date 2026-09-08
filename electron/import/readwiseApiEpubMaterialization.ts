import { insertImportedHighlightNodes } from '../../lib/core/database/importDerivedHighlights.js';
import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import {
  stableReadwiseAnnotationNodeId,
  type PreparedReadwiseApiAnnotation,
  type PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import type { ReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { buildPreparedImportRecord } from '../ipc/importSourcePipeline.js';

import {
  buildReadwiseApiEpubBookNodes,
  persistReadwiseApiEpubBookNodes
} from './readwiseApiEpubBookTree.js';
import { replaceReadwiseApiEpubImageLinks } from './readwiseApiEpubImageLinks.js';
import type { PreparedReadwiseApiEpubImages } from './readwiseApiEpubImages.js';

interface BodyNode extends NodeBodyRow {
  id: string;
}

export function hasPersistedReadwiseApiEpubStructure(rootNodeId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
    `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM nodes WHERE parent_id = ?
       UNION ALL SELECT child.id FROM nodes child JOIN descendants ON child.parent_id = descendants.id
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
  rebuildRoot: boolean;
  rootNodeId: string | null;
}) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    const rootNodeId = input.rootNodeId && !input.rebuildRoot ? input.rootNodeId : createBookTree(input);
    const bodies = readBookBodies(rootNodeId);
    const placed = placeAnnotations(input.connectionRef, input.newAnnotations, rootNodeId, bodies, input.importedAt);
    const nextStates = [...input.annotationStates, ...input.newAnnotations.map((annotation) => ({
      blockedAt: null,
      contentHash: annotation.contentHash,
      kind: annotation.kind,
      nodeId: stableReadwiseAnnotationNodeId(input.connectionRef, annotation.remoteId),
      parentRemoteId: annotation.parentRemoteId,
      remoteId: annotation.remoteId,
      remoteStatus: 'present' as const,
      sourceUpdatedAt: annotation.updatedAt
    }))];
    const sourceFingerprint = input.existingSourceFingerprint ?? readSourceFingerprint(rootNodeId);
    saveReadwiseApiImportSource({
      annotationsJson: JSON.stringify(nextStates.map(({ kind, nodeId, remoteId }) => ({ kind, nodeId, remoteId }))),
      connectionRef: input.connectionRef,
      documentId: input.document.id,
      sourceFingerprint,
      state: {
        annotations: nextStates,
        bodyState: 'materialized',
        documentBlockedAt: null,
        metadata: input.document.metadata,
        originalFile: input.previousState?.originalFile ?? null,
        remoteLifecycle: input.previousState?.remoteLifecycle ?? null,
        sourceUpdatedAt: input.document.updatedAt,
        version: 3
      },
      updatedAt: input.importedAt
    });
    return { annotationCount: placed, documentId: input.document.id, status: 'imported' as const };
  });
}

function createBookTree(input: Parameters<typeof materializeReadwiseApiEpub>[0]) {
  const structure = input.document.epubStructure;
  if (!structure?.sections.length) throw new Error('readwise_epub_structure_missing');
  const projectedStructure = input.preparedImages ?? {
    degradedReason: structure.degradedReason,
    rootAttachmentIds: [],
    rootBody: structure.rootBody,
    sections: structure.sections
  };
  const preparedRoot = buildPreparedImportRecord({
    filePath: remoteLocator(input.document.id), kind: 'html', sourceName: `${input.document.title}.html`
  }, {
    content: buildRootContent(input.document, projectedStructure.rootBody),
    degradedReason: appendReason(structure.degradedReason, projectedStructure.degradedReason),
    highlightPolicy: 'reference_only',
    hideTitleHeadingOverride: false,
    importedAt: input.importedAt,
    nodeTitleOverride: input.document.title,
    sourceIdentity: `readwise/api/${input.connectionRef}/${input.document.id}`,
    sourceLocator: remoteLocator(input.document.id),
    sourceProfile: 'body_with_highlight_sidecar'
  });
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

function readBookBodies(rootNodeId: string) {
  const rows = openDatabaseConnection().driver.queryAll<BodyNode & { child_count: number }>(
    `WITH RECURSIVE descendants(id, content, body_blob_hash) AS (
       SELECT id, content, body_blob_hash FROM nodes WHERE id = ? AND deleted_at IS NULL
       UNION ALL SELECT child.id, child.content, child.body_blob_hash FROM nodes child
       JOIN descendants ON child.parent_id = descendants.id WHERE child.deleted_at IS NULL
     ) SELECT d.id, d.content, d.body_blob_hash, cbd.data body_blob_data,
       (SELECT COUNT(*) FROM nodes child WHERE child.parent_id = d.id AND child.deleted_at IS NULL) child_count
     FROM descendants d LEFT JOIN content_blob_data cbd ON cbd.hash = d.body_blob_hash`, [rootNodeId]
  );
  return rows.filter((row) => row.child_count === 0 || row.id === rootNodeId)
    .map((row) => ({ id: row.id, content: requireResolvedNodeBody(row, row.id).content }));
}

function placeAnnotations(
  connectionRef: string,
  annotations: PreparedReadwiseApiAnnotation[],
  rootNodeId: string,
  bodies: Array<{ content: string; id: string }>,
  importedAt: string
) {
  const grouped = new Map<string, PreparedImportHighlightRecord[]>();
  for (const annotation of annotations) {
    const prepared = toHighlight(connectionRef, annotation);
    const matches = annotation.locatorText ? bodies.filter((body) =>
      applyImportedHighlightAnchors({ content: body.content, highlights: [prepared] }).highlights.length === 1
    ) : [];
    const parentId = matches.length === 1 ? matches[0]!.id : rootNodeId;
    const values = grouped.get(parentId) ?? [];
    values.push(matches.length === 1 ? prepared : { ...prepared, locatorText: null });
    grouped.set(parentId, values);
  }
  for (const [parentId, highlights] of grouped) {
    const body = bodies.find((item) => item.id === parentId)?.content ?? '';
    const anchored = applyImportedHighlightAnchors({ content: body, highlights });
    const anchoredIds = new Set(anchored.highlights.map((item) => item.nodeId));
    insertImportedHighlightNodes({
      driver: openDatabaseConnection().driver,
      highlights: [
        ...anchored.highlights,
        ...highlights.filter((item) => !anchoredIds.has(item.nodeId)).map((item) => ({ ...item, locatorText: null }))
      ],
      importedAt,
      parentContent: body,
      parentNodeId: parentId
    });
  }
  return annotations.length;
}

function toHighlight(connectionRef: string, annotation: PreparedReadwiseApiAnnotation) {
  return {
    content: annotation.content,
    label: null,
    locatorText: annotation.locatorText,
    nodeId: stableReadwiseAnnotationNodeId(connectionRef, annotation.remoteId)
  };
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
