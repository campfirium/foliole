import type { PreparedImportEmbeddedImage } from '../contract.js';

type ImageMetadata = Omit<PreparedImportEmbeddedImage, 'bytes'>;
export type EpubTextStage = <T extends object>(object: T, fields: Array<keyof T>) => T;
export interface EpubBookEntries extends ReadonlyMap<string, Uint8Array> {
  extract(name: string): Promise<void>;
  image?(name: string, metadata: ImageMetadata): PreparedImportEmbeddedImage | undefined;
}

export function archiveEmbeddedImage(entries: ReadonlyMap<string, Uint8Array>, name: string, metadata: ImageMetadata) {
  const source = entries as Partial<EpubBookEntries>;
  if (source.image) return source.image(name, metadata);
  const bytes = entries.get(name);
  return bytes ? { ...metadata, bytes } : undefined;
}
