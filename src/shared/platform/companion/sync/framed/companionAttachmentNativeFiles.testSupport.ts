import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, rm, stat, truncate } from 'node:fs/promises';
import path from 'node:path';

import type { NativeCompanionFramedFileRequest } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract.js';

export function companionAttachmentNativeFiles(root: string) {
  return async (input: NativeCompanionFramedFileRequest) => {
    if (input.operation !== 'attachment') throw new Error('Unexpected native operation');
    const partial = path.join(root, `.attachment-${input.key.slice(0, 64)}.partial`);
    const file = input.partial ? partial : path.join(root, input.key);
    switch (input.action) {
      case 'acquire': case 'source-close': return {};
      case 'source-stat-batch': return { presence: await Promise.all((input.keys ?? []).map(async key => {
        try { return (await stat(path.join(root, key))).isFile(); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return false;
        }
      })) };
      case 'source-open': return { present: true, length: (await stat(file)).size, hash: '' };
      case 'source-read': return { base64: (await readFile(file))
        .subarray(input.offset, input.offset! + input.length!).toString('base64') };
      case 'stat': {
        try {
          return { present: true, length: (await stat(file)).size,
            hash: input.partial ? '' : digest(await readFile(file)) };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return { present: false, length: 0, hash: '' };
        }
      }
      case 'truncate': await appendFile(partial, ''); await truncate(partial, input.length); return {};
      case 'append': await appendFile(partial, Buffer.from(input.base64!, 'base64')); return {};
      case 'hash': return { hash: digest(await readFile(file)) };
      case 'discard': await rm(partial, { force: true }); return {};
      case 'publish': await rename(partial, file); return {};
      default: throw new Error(`Unexpected attachment action: ${input.action}`);
    }
  };
}

function digest(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }
