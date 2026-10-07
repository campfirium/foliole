import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

const textEncoder = new TextEncoder();

export class CanonicalWriter {
  private readonly chunks: Uint8Array[] = [];
  private nodeCount = 0;
  private size = 0;

  constructor(private readonly sink?: (bytes: Uint8Array) => void) {}

  byte(value: number) { this.append(Uint8Array.of(value)); }

  data(value: Uint8Array) {
    this.u32(value.byteLength);
    this.append(value);
  }

  string(value: string) {
    assertUnicodeScalars(value);
    const bytes = textEncoder.encode(value);
    if (bytes.byteLength > FRAMED_SYNC_LIMITS.maxCanonicalStringBytes) {
      throw new Error('canonical_string_limit_exceeded');
    }
    this.data(bytes);
  }

  u32(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new Error('canonical_u32_invalid');
    }
    this.append(Uint8Array.of(
      (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff
    ));
  }

  u64(value: bigint) {
    if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error('canonical_u64_invalid');
    for (let shift = 56n; shift >= 0n; shift -= 8n) this.byte(Number((value >> shift) & 0xffn));
  }

  i64(value: bigint) {
    if (value < -0x8000_0000_0000_0000n || value > 0x7fff_ffff_ffff_ffffn) {
      throw new Error('canonical_i64_invalid');
    }
    this.u64(BigInt.asUintN(64, value));
  }

  countNodes(count: number) {
    this.nodeCount += count;
    if (this.nodeCount > FRAMED_SYNC_LIMITS.maxCanonicalFields) {
      throw new Error('canonical_node_limit_exceeded');
    }
  }

  result() {
    const result = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }

  private append(value: Uint8Array) {
    if (this.size + value.byteLength > FRAMED_SYNC_LIMITS.maxCanonicalManifestBytes) {
      throw new Error('canonical_manifest_limit_exceeded');
    }
    if (this.sink) this.sink(value);
    else this.chunks.push(value);
    this.size += value.byteLength;
  }
}


function assertUnicodeScalars(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) throw new Error('canonical_unicode_invalid');
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error('canonical_unicode_invalid');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error('canonical_unicode_invalid');
  }
}
