import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

export const IMAGE_CASES = ['existing', 'same', 'changed', 'failed', 'local', 'localized'] as const;
export type ImageCase = typeof IMAGE_CASES[number];

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(red: number, blue: number) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 64 }, () => [red, 80, blue]).flat())]);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 64 }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

const keyOf = (bytes: Buffer) => `${createHash('sha256').update(bytes).digest('hex')}.png`;
const body = (scenario: string, key: string) => `S203 ${scenario} marker\n\n![S203 ${scenario} image](asset://${key})`;

/** Data only: callers use the existing isolated library/import/sync owner to install it. */
export function createArticleImageFixture(baseUrl: string, scenario: ImageCase) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('An explicit HTTPS fixture origin is required');
  const original = png(30 + IMAGE_CASES.indexOf(scenario) * 20, 180);
  const replacement = scenario === 'changed' ? png(220, 30) : original;
  const originalKey = keyOf(original);
  const expectedKey = keyOf(replacement);
  const sourceUrl = new URL(`s203/${scenario}.png`, url.href.endsWith('/') ? url : `${url}/`).href;
  const sources = ['local', 'localized'].includes(scenario) ? {} : { [originalKey]: sourceUrl };
  const node = (name: string) => ({ id: `s203-image-${name}`, title: `S203 ${name}`, kind: 'topic' as const,
    content: scenario === 'localized' ? `S203 ${name} marker\n\n![S203 ${name} image](${sourceUrl})` : body(name, originalKey), imageSources: sources });
  return {
    scenario, originalKey, expectedKey, sourceUrl,
    nodes: [node(scenario), ...(scenario === 'changed' ? [node('sibling')] : [])],
    initialFiles: scenario === 'existing' ? [{ storageKey: originalKey, bytes: original }] : [],
    response: { path: new URL(sourceUrl).pathname, status: scenario === 'failed' ? 404 : 200, bytes: replacement },
    expectedContent: body(scenario, expectedKey),
    environment: { FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: '.s203acceptance', FOLIOLE_S203_SCENARIO: scenario,
      FOLIOLE_S203_ORIGINAL_KEY: originalKey, FOLIOLE_S203_SOURCE_URL: sourceUrl,
      [`FOLIOLE_S203_EXPECTED_${scenario.toUpperCase()}_KEY`]: expectedKey }
  };
}
