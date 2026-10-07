import { bodyJsonSegments } from './bodyJsonSegments.js';
import type { DbPort } from './dbPort.js';
import { streamBodyText, type VerifiedBodyRef } from './verifiedBody.js';

/** Emit JSON string bytes in the original scalar and escape order without a complete text value. */
export async function writeBodyJson(db: DbPort, body: VerifiedBodyRef, write: (text: string) => void) {
  write('"');
  for await (const chunk of streamBodyText(db, body)) {
    for (const segment of bodyJsonSegments(chunk)) write(segment);
  }
  write('"');
}
