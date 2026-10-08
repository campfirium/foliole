export type FramedSyncBinaryChunk = Uint8Array | string;

/** The source chunk stays borrowed until its bytes have been consumed. */
export class FramedSyncExactByteReader {
  private buffered: Uint8Array = new Uint8Array();
  private offset = 0;

  constructor(private readonly iterator: AsyncIterator<FramedSyncBinaryChunk>) {}

  async read(length: number, error: string, allowCleanEnd?: false, target?: Uint8Array): Promise<Uint8Array>;
  async read(length: number, error: string, allowCleanEnd: true, target?: Uint8Array): Promise<Uint8Array | null>;
  async read(length: number, error: string, allowCleanEnd = false, target?: Uint8Array) {
    const result = target ? target.subarray(0, length) : new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (this.offset === this.buffered.byteLength) {
        const next = await this.iterator.next();
        if (next.done) {
          if (allowCleanEnd && written === 0) return null;
          throw new Error(error);
        }
        this.buffered = typeof next.value === 'string' ? Buffer.from(next.value) : next.value;
        this.offset = 0;
        if (this.buffered.byteLength === 0) continue;
      }
      const count = Math.min(length - written, this.buffered.byteLength - this.offset);
      result.set(this.buffered.subarray(this.offset, this.offset + count), written);
      written += count;
      this.offset += count;
    }
    return result;
  }

  async close() {
    this.buffered = new Uint8Array();
    this.offset = 0;
    await this.iterator.return?.();
  }
}
