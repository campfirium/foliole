import { CANONICAL_EXTENSION_BY_MIME } from '../../platform/attachmentResource.js';

export function attachmentStorageKeySql(id: string, mime: string) {
  const extensions = Object.entries(CANONICAL_EXTENSION_BY_MIME)
    .map(([type, extension]) => `WHEN '${type}' THEN '${extension}'`).join(' ');
  return `(CASE WHEN length(${id}) = 64 AND ${id} NOT GLOB '*[^a-f0-9]*'
    THEN ${id} || (CASE lower(trim(${mime})) ${extensions} END) END)`;
}
