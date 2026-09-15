import { stableReadwiseEpubNodeId } from '../../lib/core/readwise/readwiseApiImport.js';

export function assertPristineGeneratedProjection(
  source: { remote_connection_ref: string; remote_document_id: string },
  legacyMarkerKeys: string[],
  projectedMarkerKeys: string[],
  rows: Array<{ id: string }>
) {
  const ids = (keys: string[]) => keys.map((key) => (
    stableReadwiseEpubNodeId(source.remote_connection_ref, source.remote_document_id, key)
  ));
  const actual = rows.map((row) => row.id);
  const matches = (expected: string[]) => expected.length === actual.length
    && expected.every((id, index) => actual[index] === id);
  if (matches(ids(projectedMarkerKeys))) return;
  const legacyIds = ids(legacyMarkerKeys);
  if (matches(legacyIds)) return;
  const projectedIds = ids(projectedMarkerKeys);
  const actualIsKnown = actual.every((id) => legacyIds.includes(id));
  const projectedOrder = actual.filter((id) => projectedIds.includes(id));
  if (actualIsKnown && projectedOrder.length === projectedIds.length
    && projectedOrder.every((id, index) => id === projectedIds[index])) return;
  throw new Error(`readwise_epub_generated_projection_not_pristine:${source.remote_document_id}`);
}
