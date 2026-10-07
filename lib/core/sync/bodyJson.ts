import type { DbPort } from './dbPort.js';
import { streamBodyText, type VerifiedBodyRef } from './verifiedBody.js';

/** Emit JSON string bytes in the original scalar and escape order without a complete text value. */
export async function writeBodyJson(db: DbPort, body: VerifiedBodyRef, write: (text: string) => void) {
  write('"');
  for await (const chunk of streamBodyText(db, body)) {
    for (let start = 0; start < chunk.length;) {
      let end = Math.min(start + 8192, chunk.length);
      const last = chunk.charCodeAt(end - 1);
      if (end < chunk.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
      write(JSON.stringify(chunk.slice(start, end)).slice(1, -1));
      start = end;
    }
  }
  write('"');
}
