import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';

const encoder = new TextEncoder();

/** TextEncoder scalar replacement is preserved, including lone UTF-16 surrogates. */
export function* utf8BodyTextChunks(content: string) {
  for (let start = 0; start < content.length;) {
    let end = Math.min(start + 16 * 1024, content.length);
    const last = content.charCodeAt(end - 1);
    if (end < content.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    yield encoder.encode(content.slice(start, end));
    start = end;
  }
}

/** Stable storage aligns raw byte blocks; UTF-8 characters may cross the byte boundary. */
export async function* alignedBodyTextChunks(content: string, byteLength: number) {
  let remaining = byteLength;
  let block = new Uint8Array(Math.min(remaining, BODY_CONTENT_CHUNK_BYTES));
  let written = 0;
  for (const bytes of utf8BodyTextChunks(content)) {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = Math.min(block.byteLength - written, bytes.byteLength - offset);
      if (count < 1) throw new Error('body_text_length_mismatch');
      block.set(bytes.subarray(offset, offset + count), written);
      offset += count;
      written += count;
      if (written === block.byteLength) {
        yield block;
        remaining -= block.byteLength;
        block = new Uint8Array(Math.min(remaining, BODY_CONTENT_CHUNK_BYTES));
        written = 0;
      }
    }
  }
  if (remaining !== 0 || written !== 0) throw new Error('body_text_length_mismatch');
}
