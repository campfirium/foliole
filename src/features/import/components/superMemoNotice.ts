type NoticeKind = 'selectionRead' | 'collectionChoice' | 'xmlAccess' | 'xmlUpdated' | 'xmlSize' | 'xmlRead' | 'xmlFormat' |
  'collectionAccess' | 'collectionRead' | 'collectionMismatch' | 'sourceMismatch' | 'preview' | 'convert' | 'save';

type DiagnosticNotice = { kind: NoticeKind; code: string };
export type SuperMemoNotice = false | NoticeKind | DiagnosticNotice;

const diagnosticKinds: Record<string, NoticeKind> = {
  invalid_supermemo_xml: 'xmlFormat',
  supermemo_xml_malformed: 'xmlFormat',
  supermemo_xml_doctype: 'xmlFormat',
  invalid_supermemo_element_number: 'xmlFormat',
  invalid_supermemo_element_type: 'xmlFormat',
  duplicate_supermemo_element: 'xmlFormat',
  invalid_supermemo_history_row: 'xmlFormat',
  supermemo_element_count_mismatch: 'xmlFormat',
  invalid_supermemo_xml_path: 'xmlRead',
  supermemo_xml_missing: 'xmlRead',
  invalid_supermemo_xml_size: 'xmlSize',
  supermemo_xml_updated: 'xmlUpdated',
  supermemo_collection_updated: 'xmlUpdated',
  supermemo_preview_changed: 'xmlUpdated',
  supermemo_update_changed: 'xmlUpdated',
  supermemo_collection_access_denied: 'collectionAccess',
  supermemo_collection_unreadable: 'collectionRead',
  supermemo_collection_mismatch: 'collectionMismatch',
  supermemo_source_mismatch: 'sourceMismatch',
  supermemo_link_save_failed: 'save'
};

export function superMemoNoticeKind(notice: SuperMemoNotice) {
  return typeof notice === 'object' ? notice.kind : notice || undefined;
}

export function previewFailure(error: unknown, fallback: NoticeKind = 'preview'): Exclude<SuperMemoNotice, false> {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const message = String(error).replace(/^(?:Error: )?(?:Error invoking remote method '[^']+': )?(?:Error: )*/, '');
  // Only show diagnostic identifiers emitted by this importer, never raw error text.
  for (const code of [cause, message]) {
    if (Object.hasOwn(diagnosticKinds, code)) return { kind: diagnosticKinds[code]!, code };
  }
  return fallback;
}
