interface MultipartBlob {
  body: Buffer;
  hash: string;
}

export function parseCompanionContentBlobMultipart(body: Buffer, contentType: string | null): MultipartBlob[] {
  const boundary = readBoundary(contentType);
  const marker = Buffer.from(`--${boundary}`);
  const closing = Buffer.from(`--${boundary}--`);
  const separator = Buffer.from('\r\n\r\n');
  const crlf = Buffer.from('\r\n');
  const blobs: MultipartBlob[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    if (body.subarray(cursor, cursor + closing.length).equals(closing)) return blobs;
    if (!body.subarray(cursor, cursor + marker.length).equals(marker)) throw new Error('content_blob_batch_invalid');
    cursor = requireSequence(body, cursor + marker.length, crlf);
    const headerEnd = body.indexOf(separator, cursor);
    if (headerEnd < 0) throw new Error('content_blob_batch_truncated');
    const headers = parseHeaders(body.subarray(cursor, headerEnd).toString('utf8'));
    cursor = headerEnd + separator.length;
    const length = Number(headers.get('content-length'));
    const hash = headers.get('x-blob-hash') ?? '';
    if (!Number.isSafeInteger(length) || length < 0 || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('content_blob_batch_invalid');
    }
    if (cursor + length > body.length) throw new Error('content_blob_batch_truncated');
    blobs.push({ body: body.subarray(cursor, cursor + length), hash });
    cursor = requireSequence(body, cursor + length, crlf);
  }
  throw new Error('content_blob_batch_truncated');
}

function readBoundary(contentType: string | null) {
  if (!contentType?.toLowerCase().startsWith('multipart/mixed')) throw new Error('content_blob_batch_invalid');
  const value = contentType.split(';').map((part) => part.trim()).find((part) => part.toLowerCase().startsWith('boundary='));
  const boundary = value?.slice('boundary='.length).replace(/^"|"$/g, '') ?? '';
  if (!boundary) throw new Error('content_blob_batch_invalid');
  return boundary;
}

function parseHeaders(text: string) {
  return new Map(text.split('\r\n').flatMap((line) => {
    const separator = line.indexOf(':');
    return separator > 0 ? [[line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]] : [];
  }));
}

function requireSequence(body: Buffer, cursor: number, expected: Buffer) {
  if (!body.subarray(cursor, cursor + expected.length).equals(expected)) throw new Error('content_blob_batch_truncated');
  return cursor + expected.length;
}
