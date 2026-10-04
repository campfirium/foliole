import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';

const CHUNK_BYTES = 256 * 1024;

/** Read only the leading frontmatter, preserving the existing line normalization. */
export async function readNodeInlineBodyProjection(port: DbPort, hash: string, size: number) {
  const decoder = new TextDecoder();
  const lines: string[] = [];
  let pending = '';
  for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
    const limit = Math.min(CHUNK_BYTES, size - offset);
    const [row] = await port.query<{ bytes: string }>(
      'SELECT hex(substr(CAST(data AS BLOB), ?, ?)) AS bytes FROM content_blob_data WHERE hash = ?',
      [offset + 1, limit, hash]);
    if (!row || row.bytes.length !== limit * 2 || !/^[0-9a-f]*$/iu.test(row.bytes)) {
      throw new Error('sync_inline_body_chunk_invalid');
    }
    pending += decoder.decode(hexToBytes(row.bytes), { stream: offset + limit < size });
    for (let newline = pending.indexOf('\n'); newline !== -1; newline = pending.indexOf('\n')) {
      const line = pending.slice(0, newline).replace(/\r$/u, '');
      pending = pending.slice(newline + 1);
      if (lines.length === 0 && !/^\s*---\s*$/u.test(line)) return '';
      lines.push(line);
      if (lines.length > 1 && /^\s*---\s*$/u.test(line)) return lines.join('\n') + '\n';
    }
    if (lines.length === 0 && !/^\s*-{0,3}\s*$/u.test(pending)) return '';
  }
  if (lines.length > 0 && /^\s*---\s*$/u.test(pending)) return [...lines, pending].join('\n') + '\n';
  return '';
}
