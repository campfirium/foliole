import type { PreparedImportEmbeddedImage } from '../../../../lib/core/import/contract';
import { readEpubArchiveIndex, type EpubZipEntry } from '../../../../lib/core/import/epub/epubArchive';
import type { EpubBookEntries } from '../../../../lib/core/import/epub/epubBookEntries';
import { epubCrc32 } from '../../../../lib/core/import/epub/epubEntryChecksum';

export class SelectedEpubArchive extends Map<string, Uint8Array> implements EpubBookEntries {
  private readonly images = new Set<string>();
  constructor(private readonly bytes: Uint8Array, private readonly index: Map<string, EpubZipEntry>, private readonly signal?: AbortSignal) { super(); }
  static async open(bytes: Uint8Array, signal?: AbortSignal) {
    return new SelectedEpubArchive(bytes, await readEpubArchiveIndex({ size: bytes.length,
      read: async (offset, length) => bytes.subarray(offset, offset + length) }), signal);
  }
  image(name: string, metadata: Omit<PreparedImportEmbeddedImage, 'bytes'>) {
    if (!this.index.has(name)) return undefined;
    this.images.add(name);
    const read = () => this.get(name);
    return { ...metadata, get bytes() {
      const bytes = read();
      if (!bytes) throw new Error('EPUB image was not read.');
      return bytes;
    } };
  }
  async readImages() { for (const name of this.images) await this.extract(name); }
  override has(name: string) { return this.index.has(name); }
  async extract(name: string) {
    this.signal?.throwIfAborted();
    const entry = this.index.get(name);
    if (!entry || super.has(name)) return;
    if (entry.method !== 0 && entry.method !== 8) throw new Error('Unsupported EPUB ZIP compression.');
    const input = this.bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    const stream = new Blob([Uint8Array.from(input)]).stream();
    const reader = (entry.method === 8 ? stream.pipeThrough(new DecompressionStream('deflate-raw')) : stream).getReader();
    const abort = () => { void reader.cancel(this.signal?.reason).catch(() => undefined); };
    this.signal?.addEventListener('abort', abort, { once: true });
    const chunks: Uint8Array[] = [];
    let length = 0; let crc = 0;
    try {
      while (true) {
        this.signal?.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > entry.size) throw new Error('EPUB import failed: ZIP output exceeds declared size');
        crc = epubCrc32(chunk.value, crc); chunks.push(chunk.value);
      }
      this.signal?.throwIfAborted();
      if (length !== entry.size || crc !== entry.crc) throw new Error('EPUB import failed: ZIP size or checksum mismatch');
      const output = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      this.set(name, output);
    } finally { this.signal?.removeEventListener('abort', abort); await reader.cancel(); }
  }
}
