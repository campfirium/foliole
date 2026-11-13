export type WebDavRelayMethod = 'DELETE' | 'GET' | 'MKCOL' | 'MOVE' | 'PROPFIND' | 'PUT';
export type WebDavRelayRequest = <T>(url: URL, input: {
  method: WebDavRelayMethod;
  headers?: Record<string, string>;
  body?: { bytes: number; chunks(): AsyncIterable<Uint8Array>; fileRange?: { directory: string; count: number } };
}, receive: (status: number, body: AsyncIterable<Uint8Array>) => Promise<T>) => Promise<T>;

export async function webDavRelayStatus(status: number, body: AsyncIterable<Uint8Array>) {
  await drain(body);
  return status;
}

async function drain(body: AsyncIterable<Uint8Array>) {
  const reader = body[Symbol.asyncIterator]();
  while (!(await reader.next()).done) { /* Account for error bodies too. */ }
}

async function compareRemoteBytes(request: WebDavRelayRequest, url: URL,
  ciphertext: NonNullable<Parameters<WebDavRelayRequest>[1]['body']>) {
  return request(url, { method: 'GET' }, async (status, body) => {
    if (status !== 200) {
      await drain(body);
      if (status === 404) return 'missing';
      throw new Error(`webdav_relay_read_failed:${status}`);
    }
    return await equalBytes(ciphertext.chunks(), body) ? 'matching' : 'different';
  });
}

async function equalBytes(left: AsyncIterable<Uint8Array>, right: AsyncIterable<Uint8Array>) {
  const expected = left[Symbol.asyncIterator]();
  let chunk: Uint8Array | undefined;
  let offset = 0;
  let equal = true;
  try {
    for await (const received of right) {
      for (let cursor = 0; equal && cursor < received.length;) {
        if (!chunk || offset === chunk.length) {
          const next = await expected.next();
          chunk = next.done ? undefined : next.value;
          offset = 0;
          if (!chunk) { equal = false; break; }
        }
        const count = Math.min(received.length - cursor, chunk.length - offset);
        equal = received.subarray(cursor, cursor + count).every((byte, index) => byte === chunk![offset + index]);
        cursor += count;
        offset += count;
      }
    }
    return equal && (!chunk || offset === chunk.length) && (await expected.next()).done === true;
  } finally {
    await expected.return?.();
  }
}

export async function publishWebDavRelayFile(request: WebDavRelayRequest, destination: URL,
  ciphertext: NonNullable<Parameters<WebDavRelayRequest>[1]['body']>) {
  assertPublication(destination, ciphertext.bytes);
  const existing = await compareRemoteBytes(request, destination, ciphertext);
  if (existing === 'matching') return 'already_published';
  if (existing === 'different') throw new Error('webdav_relay_destination_conflict');

  const staged = new URL(destination);
  staged.pathname += '.partial';
  const put = await request(staged, { method: 'PUT', body: ciphertext,
    headers: { 'Content-Type': 'application/octet-stream' } }, webDavRelayStatus);
  if (put !== 201 && put !== 204) throw new Error(`webdav_relay_stage_failed:${put}`);
  if (await compareRemoteBytes(request, staged, ciphertext) !== 'matching') throw new Error('webdav_relay_stage_mismatch');

  const move = await request(staged, { method: 'MOVE',
    headers: { Destination: destination.href, Overwrite: 'F' } }, webDavRelayStatus);
  if (move === 201) return 'published';
  if (move === 404 || move === 412) {
    const confirmed = await compareRemoteBytes(request, destination, ciphertext);
    if (confirmed === 'matching') return 'already_published';
    if (confirmed === 'different') throw new Error('webdav_relay_destination_conflict');
  }
  throw new Error(`webdav_relay_move_failed:${move}`);
}


function assertPublication(destination: URL, bytes: number) {
  if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password ||
      destination.search || destination.hash || !destination.pathname.endsWith('.dat') || bytes <= 0) {
    throw new Error('webdav_relay_invalid_publication');
  }
}

export async function publishWebDavRelayAttachment(request: WebDavRelayRequest, destination: URL,
  ciphertext: NonNullable<Parameters<WebDavRelayRequest>[1]['body']>, assertScope: () => Promise<void>) {
  assertPublication(destination, ciphertext.bytes);
  if (await isAttachmentPublished(request, destination, ciphertext.bytes)) return;
  const staged = new URL(destination);
  staged.pathname += '.partial';
  const put = await request(staged, { method: 'PUT', body: ciphertext,
    headers: { 'Content-Type': 'application/octet-stream' } }, webDavRelayStatus);
  if (put !== 201 && put !== 204) throw new Error(`webdav_relay_stage_failed:${put}`);
  if (await readResourceLength(request, staged) !== ciphertext.bytes) throw new Error('webdav_relay_stage_mismatch');

  await assertScope();
  const move = await request(staged, { method: 'MOVE',
    headers: { Destination: destination.href, Overwrite: 'F' } }, webDavRelayStatus);
  if (move === 201) return;
  if ((move === 404 || move === 412) && await isAttachmentPublished(request, destination, ciphertext.bytes)) return;
  throw new Error(`webdav_relay_move_failed:${move}`);
}

async function isAttachmentPublished(request: WebDavRelayRequest, url: URL, bytes: number) {
  const length = await readResourceLength(request, url);
  if (length === null) return false;
  if (length !== bytes) throw new Error('webdav_relay_destination_conflict');
  return true;
}

function readResourceLength(request: WebDavRelayRequest, url: URL) {
  return request(url, { method: 'PROPFIND', headers: { Depth: '0' } }, async (status, body) => {
    if (status !== 207) {
      await drain(body);
      if (status === 404) return null;
      throw new Error(`webdav_relay_read_failed:${status}`);
    }
    return parseResourceLength(await readResourceProperties(body), url);
  });
}

async function readResourceProperties(body: AsyncIterable<Uint8Array>) {
  let xml = '';
  let size = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > 64 * 1024) throw new Error('webdav_relay_resource_properties_too_large');
    xml += decoder.decode(chunk, { stream: true });
  }
  return xml + decoder.decode();
}

function parseResourceLength(xml: string, url: URL) {
  const responses = [...xml.matchAll(/<((?:[\w.-]+:)?response)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gu)];
  const response = responses.length === 1 ? responses[0]?.[2] : undefined;
  const hrefs = response ? [...response.matchAll(/<(?:[\w.-]+:)?href>([^<]+)<\/(?:[\w.-]+:)?href\s*>/gu)] : [];
  const href = hrefs.length === 1 ? hrefs[0]?.[1] : undefined;
  if (!response || !href || URL.parse(href.trim().replaceAll('&amp;', '&'), url)?.href !== url.href) {
    throw new Error('webdav_relay_resource_properties_invalid');
  }
  const lengths = [];
  for (const [, , properties] of response.matchAll(/<((?:[\w.-]+:)?propstat)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gu)) {
    if (!properties || !/<(?:[\w.-]+:)?status>\s*HTTP\/\d+(?:\.\d+)? 200(?:\s|<)/u.test(properties)) continue;
    lengths.push(...properties.matchAll(/<(?:[\w.-]+:)?getcontentlength>\s*(\d+)\s*<\/(?:[\w.-]+:)?getcontentlength\s*>/gu));
  }
  const length = Number(lengths[0]?.[1]);
  if (lengths.length !== 1 || !Number.isSafeInteger(length)) throw new Error('webdav_relay_resource_length_unavailable');
  return length;
}
