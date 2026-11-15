import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { NativeSuperMemoSource } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { isSameOrNestedPath } from '../libraryPathSafety.js';

import { assertAuthorizedImportDirectoryPath } from './importPathAuthorization.js';

const MAX_XML_BYTES = 128 * 1024 * 1024;

function isMissing(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function readSuperMemoSource(directory: string): Promise<NativeSuperMemoSource> {
  const root = await assertAuthorizedImportDirectoryPath(directory);
  const xmlPath = await realpath(path.join(root, 'SuperMemo.xml')).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (!xmlPath) return { status: 'missing-xml' };
  if (!isSameOrNestedPath(xmlPath, root)) throw new Error('invalid_supermemo_xml_path');
  const file = await open(xmlPath, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await lstat(path.join(root, 'info')).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (info && !info.isDirectory()) throw new Error('invalid_supermemo_collection_path');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_XML_BYTES) throw new Error('invalid_supermemo_xml_size');
    const bytes = Buffer.alloc(stat.size);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== bytes.length || (await file.stat()).size !== stat.size) throw new Error('supermemo_source_changed');
    return { status: 'ready', name: path.basename(root), xml: bytes.toString('utf8'), collectionDirectory: info ? root : undefined };
  } finally {
    await file.close();
  }
}
