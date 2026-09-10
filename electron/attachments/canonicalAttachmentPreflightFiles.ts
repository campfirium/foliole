import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { classifyAttachmentBytes, type AttachmentByteKind } from '../../lib/platform/attachmentByteClassification.js';

export interface AttachmentFileEvidence {
  device: number;
  inode: number;
  kind: AttachmentByteKind;
  mtimeMs: number;
  name: string;
  sha256: string;
  sizeBytes: number;
}

function inspectFile(assetsDir: string, name: string): AttachmentFileEvidence | null {
  const filePath = path.join(assetsDir, name);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  const descriptor = fs.openSync(filePath, 'r');
  const hash = createHash('sha256');
  const prefix = Buffer.alloc(256);
  let prefixLength = 0;
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead && prefixLength < prefix.length) {
        const copied = Math.min(bytesRead, prefix.length - prefixLength);
        buffer.copy(prefix, prefixLength, 0, copied);
        prefixLength += copied;
      }
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return {
    device: stat.dev, inode: stat.ino, kind: classifyAttachmentBytes(prefix.subarray(0, prefixLength)),
    mtimeMs: stat.mtimeMs, name, sha256: hash.digest('hex'), sizeBytes: stat.size
  };
}

export function inventoryAttachmentFiles(assetsDir: string) {
  if (!path.isAbsolute(assetsDir)) throw new Error('assets_path_must_be_absolute');
  const root = fs.realpathSync(assetsDir);
  if (!fs.statSync(root).isDirectory()) throw new Error('assets_path_not_directory');
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const unsupportedEntries = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  const files = entries.filter((entry) => entry.isFile()).flatMap((entry) => {
    const evidence = inspectFile(root, entry.name);
    return evidence ? [evidence] : [];
  });
  return { files, root, unsupportedEntries };
}

export function hashFile(filePath: string) {
  const descriptor = fs.openSync(filePath, 'r');
  const hash = createHash('sha256');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}
