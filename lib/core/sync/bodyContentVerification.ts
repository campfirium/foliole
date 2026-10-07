import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import { BodyFrontmatterRange } from './bodyFrontmatterRange.js';

export const bodyIdentity = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
  byteLength: z.number().int().nonnegative().max(8 * 1024 * 1024 * 1024)
});

/** Both database adapters validate the same immutable raw bytes and derived projections. */
export class BodyContentVerification {
  readonly identity: z.infer<typeof bodyIdentity>;
  private readonly digest = sha256.create();
  private readonly decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  private readonly frontmatter = new BodyFrontmatterRange();
  private consumed = 0;
  private utf16Length = 0;

  constructor(identity: z.infer<typeof bodyIdentity>) { this.identity = bodyIdentity.parse(identity); }

  get offset() { return this.consumed; }

  push(offset: number, bytes: Uint8Array) {
    const expected = Math.min(BODY_CONTENT_CHUNK_BYTES, this.identity.byteLength - this.consumed);
    if (offset !== this.consumed || !(bytes instanceof Uint8Array) || expected < 1 || bytes.byteLength !== expected) {
      throw new Error('body_coverage_incomplete');
    }
    this.digest.update(bytes);
    this.utf16Length += this.decoder.decode(bytes, { stream: true }).length;
    this.frontmatter.push(bytes);
    this.consumed += bytes.byteLength;
  }

  finish() {
    this.utf16Length += this.decoder.decode().length;
    if (this.consumed !== this.identity.byteLength) throw new Error('body_coverage_incomplete');
    if (bytesToHex(this.digest.digest()) !== this.identity.hash) throw new Error('body_hash_mismatch');
    return { ...this.identity, utf16Length: this.utf16Length, frontmatterEnd: this.frontmatter.finish() };
  }

  destroy() { this.digest.destroy(); }
}
