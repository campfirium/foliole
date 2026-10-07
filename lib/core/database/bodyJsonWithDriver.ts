import { bodyJsonSegments } from '../sync/bodyJsonSegments.js';
import type { VerifiedBodyRef } from '../sync/verifiedBody.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import type { DatabaseDriver } from './driver.js';
import { readBodyRangeWithDriver } from './verifiedBodyWithDriver.js';

export function writeBodyJsonWithDriver(driver: DatabaseDriver, ref: VerifiedBodyRef, write: (text: string) => void) {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  write('"');
  for (let offset = 0; offset < ref.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    const text = decoder.decode(readBodyRangeWithDriver(driver, ref, offset, BODY_CONTENT_CHUNK_BYTES), { stream: true });
    for (const segment of bodyJsonSegments(text)) write(segment);
  }
  for (const segment of bodyJsonSegments(decoder.decode())) write(segment);
  write('"');
}
