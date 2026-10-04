import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readEpubArchiveIndex, type EpubZipEntry } from './epubArchive.js';
import { extractEpubEntry } from './epubArchiveExtraction.js';

export class EpubArchiveEntries extends Map<string, Uint8Array> {
  readonly files = new Map<string, string>();
  private readonly extracted = new Set<string>();
  private constructor(private readonly sourcePath: string, private readonly index: Map<string, EpubZipEntry>, root: string) {
    super();
    for (const name of index.keys()) this.files.set(name, path.join(root, `entry-${this.files.size}`));
  }
  static async open(filePath: string, root: string) {
    return new EpubArchiveEntries(filePath, await readEpubArchiveIndex(filePath), root);
  }
  async extract(name: string) {
    const entry = this.index.get(name);
    const filePath = this.files.get(name);
    if (!entry || !filePath || this.extracted.has(name)) return;
    await extractEpubEntry(this.sourcePath, entry, filePath);
    this.extracted.add(name);
  }
  override get(name: string) {
    const filePath = this.files.get(name);
    if (!filePath || !this.extracted.has(name)) return undefined;
    const available = process.availableMemory() || os.freemem();
    if ((this.index.get(name)?.size ?? 0) > available / 2) {
      throw new Error('EPUB import failed: insufficient available memory for this document');
    }
    return readFileSync(filePath);
  }
  override has(name: string) { return this.index.has(name); }
}
