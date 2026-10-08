import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../sync/dbPort.js';

import { BODY_READ_CHUNK_BYTES } from './bodyReadBudget.js';
import type { DatabaseDriver } from './driver.js';

export const BODY_CANDIDATE_SQL = `SELECT b.kind, length(CAST(data.data AS BLOB)) AS byte_length
  FROM content_blobs b JOIN content_blob_data data ON data.hash = b.hash WHERE b.hash = ?`;
const RANGE_SQL = 'SELECT substr(CAST(data AS BLOB), ?, ?) AS data FROM content_blob_data WHERE hash = ?';
type Candidate = { kind: string; byte_length: number };

function candidateLength(hash: string, row?: Candidate) {
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('text_body_collection_invalid_hash');
  if (!row || row.kind !== 'text_body') return null;
  if (!Number.isSafeInteger(row.byte_length) || row.byte_length < 0) fail(hash);
  return row.byte_length;
}

function fail(hash: string): never {
  throw new Error(`text_body_collection_invalid_bytes:${hash}`);
}

function checkedChunk(hash: string, length: number, decoder: TextDecoder, row?: { data: Uint8Array }) {
  if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== length) fail(hash);
  checkText(hash, decoder, row.data);
  return row.data;
}

function checkText(hash: string, decoder: TextDecoder, chunk?: Uint8Array) {
  try { decoder.decode(chunk, { stream: chunk !== undefined }); }
  catch { fail(hash); }
}

/** Verify the selected continuous candidate without returning its complete text across a bridge. */
export function verifyTextBodyCandidate(driver: DatabaseDriver, hash: string) {
  const bytes = candidateLength(hash, driver.queryOne<Candidate>(BODY_CANDIDATE_SQL, [hash]));
  if (bytes === null) return null;
  const digest = sha256.create();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  try {
    for (let offset = 0; offset < bytes; offset += BODY_READ_CHUNK_BYTES) {
      const length = Math.min(BODY_READ_CHUNK_BYTES, bytes - offset);
      digest.update(checkedChunk(hash, length, decoder,
        driver.queryOne<{ data: Uint8Array }>(RANGE_SQL, [offset + 1, length, hash])));
    }
    checkText(hash, decoder);
    if (bytesToHex(digest.digest()) !== hash) fail(hash);
    return { bytes };
  } finally { digest.destroy(); }
}

export async function verifyTextBodyCandidateWithPort(port: DbPort, hash: string) {
  const [candidate] = await port.query<Candidate>(BODY_CANDIDATE_SQL, [hash]);
  const bytes = candidateLength(hash, candidate);
  if (bytes === null) return null;
  const digest = sha256.create();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  try {
    for (let offset = 0; offset < bytes; offset += BODY_READ_CHUNK_BYTES) {
      const length = Math.min(BODY_READ_CHUNK_BYTES, bytes - offset);
      const [row] = await port.query<{ data: Uint8Array }>(RANGE_SQL, [offset + 1, length, hash]);
      digest.update(checkedChunk(hash, length, decoder, row));
    }
    checkText(hash, decoder);
    if (bytesToHex(digest.digest()) !== hash) fail(hash);
    return { bytes };
  } finally { digest.destroy(); }
}
