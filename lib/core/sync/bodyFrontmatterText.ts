import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import type { DbPort } from './dbPort.js';
import { readBodyRange, type VerifiedBodyRef } from './verifiedBody.js';

/** Lists consume the saved prefix range with the original CRLF and trailing-newline projection. */
export async function* streamBodyFrontmatter(db: DbPort, ref: VerifiedBodyRef) {
  if (ref.frontmatterEnd === null) return;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let pendingCarriageReturn = false;
  let endedWithNewline = false;
  for (let offset = 0; offset < ref.frontmatterEnd; offset += BODY_CONTENT_CHUNK_BYTES) {
    const bytes = await readBodyRange(db, ref, offset, Math.min(BODY_CONTENT_CHUNK_BYTES, ref.frontmatterEnd - offset));
    let text = decoder.decode(bytes, { stream: true });
    if (pendingCarriageReturn) text = '\r' + text;
    pendingCarriageReturn = text.endsWith('\r');
    if (pendingCarriageReturn) text = text.slice(0, -1);
    text = text.replace(/\r\n/gu, '\n');
    if (text) {
      endedWithNewline = text.endsWith('\n');
      yield text;
    }
  }
  const tail = decoder.decode();
  if (tail) throw new Error('body_frontmatter_range_invalid');
  if (pendingCarriageReturn) { yield '\r'; endedWithNewline = false; }
  if (!endedWithNewline) yield '\n';
}
