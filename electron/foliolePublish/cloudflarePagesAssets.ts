import fs from 'node:fs';
import path from 'node:path';

import { blake3 } from '@noble/hashes/blake3.js';

const MAX_FILE_COUNT = 20_000;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_UPLOAD_BATCH_SIZE = 50 * 1024 * 1024;

export interface CloudflarePagesUploadFile {
  body: Buffer;
  contentType: string;
  hash: string;
  relativePath: string;
}

function contentType(file: string) {
  const extension = path.extname(file).toLowerCase();
  return ({ '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/rss+xml' } as Record<string, string>)[extension]
    ?? 'application/octet-stream';
}

export function cloudflarePagesAssetHash(file: string, body: Buffer) {
  const extension = path.extname(file).slice(1);
  const input = Buffer.from(`${body.toString('base64')}${extension}`);
  return Buffer.from(blake3(Uint8Array.from(input))).toString('hex').slice(0, 32);
}

function listFiles(root: string, current = root): string[] {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, absolute) : [absolute];
  });
}

export function prepareCloudflarePagesFiles(root: string) {
  const paths = listFiles(root);
  if (paths.length > MAX_FILE_COUNT) throw new Error('Cloudflare Pages deployments support at most 20,000 files.');
  return paths.map((file): CloudflarePagesUploadFile => {
    const body = fs.readFileSync(file);
    if (body.byteLength > MAX_FILE_SIZE) throw new Error(`Cloudflare Pages only supports files up to 25 MiB: ${path.basename(file)}`);
    return {
      body, contentType: contentType(file), hash: cloudflarePagesAssetHash(file, body),
      relativePath: path.relative(root, file).split(path.sep).join('/')
    };
  });
}

export function cloudflarePagesUploadBatches(files: CloudflarePagesUploadFile[]) {
  const batches: CloudflarePagesUploadFile[][] = [];
  for (const file of files) {
    const current = batches.at(-1);
    const currentSize = current?.reduce((sum, item) => sum + item.body.byteLength, 0) ?? 0;
    if (!current || currentSize + file.body.byteLength > MAX_UPLOAD_BATCH_SIZE) batches.push([file]);
    else current.push(file);
  }
  return batches;
}
