function mark(type: string, id: string) {
  return `INSERT INTO sync_identity_dirty_keys (object_type, object_id)
    SELECT '${type}', ${id} WHERE NOT EXISTS (
      SELECT 1 FROM sync_identity_dirty_keys
      WHERE object_type = '${type}' AND object_id = ${id}
    );`;
}

function entityTriggers(table: string, id: string, types: readonly string[]) {
  return ['INSERT', 'UPDATE', 'DELETE'].map((action) => {
    const references = action === 'INSERT' ? ['NEW'] : action === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
    const statements = references.flatMap((reference) => types.map((type) =>
      mark(type, id.replaceAll('$', reference))));
    return `CREATE TRIGGER IF NOT EXISTS trg_sync_identity_${table}_${action.toLowerCase()}
      AFTER ${action} ON ${table} BEGIN ${statements.join('\n')} END`;
  });
}

function markViewStates(where: string) {
  return `INSERT INTO sync_identity_dirty_keys (object_type, object_id)
    SELECT 'view_state', state.object_id FROM sync_object_state state
    WHERE state.object_type = 'view_state' AND ${where}
      AND NOT EXISTS (SELECT 1 FROM sync_identity_dirty_keys dirty
        WHERE dirty.object_type = 'view_state' AND dirty.object_id = state.object_id);`;
}

function viewStateTriggers(table: 'workspace_meta' | 'node_view_state', where: string) {
  return ['INSERT', 'UPDATE', 'DELETE'].map((action) => {
    const references = action === 'INSERT' ? ['NEW'] : action === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
    const statements = references.map((reference) => markViewStates(where.replaceAll('$', reference)));
    return `CREATE TRIGGER IF NOT EXISTS trg_sync_identity_${table}_${action.toLowerCase()}
      AFTER ${action} ON ${table} BEGIN ${statements.join('\n')} END`;
  });
}

function sourceTriggers() {
  return ['INSERT', 'UPDATE', 'DELETE'].map((action) => {
    const references = action === 'INSERT' ? ['NEW'] : action === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
    const statements = references.flatMap((reference) => [
      ['external_search_folders', 'external_folder', 'id'],
      ['watched_folder_bindings', 'watched_folder', 'binding_id'],
      ['import_sources', 'import_source', 'source_fingerprint']
    ].map(([table, type, id]) => `INSERT INTO sync_identity_dirty_keys (object_type, object_id)
      SELECT '${type}', entity.${id} FROM ${table} entity
      WHERE entity.source_ref = ${reference}.source_ref
        AND NOT EXISTS (SELECT 1 FROM sync_identity_dirty_keys dirty
          WHERE dirty.object_type = '${type}' AND dirty.object_id = entity.${id});`));
    return `CREATE TRIGGER IF NOT EXISTS trg_sync_identity_desktop_sources_${action.toLowerCase()}
      AFTER ${action} ON desktop_sources BEGIN ${statements.join('\n')} END`;
  });
}

export const SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS = [
  ...entityTriggers('nodes', '$.id', ['node', 'node_reading', 'node_review', 'node_open_state']),
  ...entityTriggers('external_documents', '$.document_id', ['external_document']),
  ...entityTriggers('external_search_folders', '$.id', ['external_folder']),
  ...entityTriggers('import_sources', '$.source_fingerprint', ['import_source']),
  ...entityTriggers('node_open_state', '$.node_id', ['node_open_state']),
  ...entityTriggers('node_reading', '$.node_id', ['node_reading']),
  ...entityTriggers('node_review', '$.node_id', ['node_review']),
  ...entityTriggers('node_text_alternatives', '$.alternative_id', ['node_text_alternative']),
  ...entityTriggers('parent_child_order', '$.parent_id', ['parent_child_order']),
  ...entityTriggers('pdf_page_text', "$.attachment_id || ':' || $.page", ['pdf_page_text']),
  ...entityTriggers('setting_records',
    "$.scope || ':' || $.platform || ':' || $.form_factor || ':' || $.host_name || ':' || $.key",
    ['setting']),
  ...entityTriggers('watched_folder_bindings', '$.binding_id', ['watched_folder']),
  ...entityTriggers('topic_daily_count_entries', '$.id', ['topic_daily_count']),
  ...sourceTriggers(),
  ...viewStateTriggers('workspace_meta',
    "$.key = 'active_node_id' AND state.object_id LIKE '%:active_node'"),
  ...viewStateTriggers('node_view_state',
    "substr(state.object_id, -length(':' || $.host_name || ':node:' || $.node_id)) = " +
      "':' || $.host_name || ':node:' || $.node_id")
] as const;
