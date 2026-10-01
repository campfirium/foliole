/** Old schemas remain readable by numbered migrations, never by current fresh install. */
export function isRetiredAttachmentSchema(statement: string) {
  return /CREATE (?:TABLE|INDEX) IF NOT EXISTS (?:attachments|node_attachments|idx_node_attachments_attachment_id)\b/.test(statement);
}
