import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';

const textFiles = new WeakMap<object, Map<string, string>>();
const imageFiles = new WeakMap<object, string>();

export function stageEpubText<T extends object>(object: T, fields: Array<keyof T>, root: string) {
  const paths = textFiles.get(object) ?? new Map<string, string>();
  for (const field of fields) {
    const key = String(field);
    const value = object[field];
    if (typeof value !== 'string') throw new Error('Invalid EPUB staged text');
    const filePath = paths.get(key) ?? path.join(root, `${randomUUID()}.txt`);
    writeFileSync(filePath, value, { mode: 0o600 });
    paths.set(key, filePath);
    Object.defineProperty(object, field, {
      configurable: true, enumerable: true,
      get: () => readFileSync(filePath, 'utf8'),
      set: (next: string) => { writeFileSync(filePath, next, { mode: 0o600 }); }
    });
  }
  textFiles.set(object, paths);
  return object;
}

export function stagedEpubTextPath(object: object, field: string) {
  const filePath = textFiles.get(object)?.get(field);
  if (!filePath) throw new Error('Missing EPUB staged text');
  return filePath;
}

export function createFileBackedEpubImage(input: Omit<PreparedImportEmbeddedImage, 'bytes'>, filePath: string) {
  const image = { ...input, get bytes() { return readFileSync(filePath); } };
  imageFiles.set(image, filePath);
  return image;
}

export function epubImageFilePath(image: PreparedImportEmbeddedImage) {
  return imageFiles.get(image);
}

export function attachStagedEpubText<T extends object>(object: T, field: keyof T, filePath: string) {
  Object.defineProperty(object, field, {
    enumerable: true, configurable: true, get: () => readFileSync(filePath, 'utf8')
  });
  return object;
}
