import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';

export const BODY_CANDIDATE_SQL = `SELECT b.kind, length(CAST(data.data AS BLOB)) AS byte_length
  FROM content_blobs b JOIN content_blob_data data ON data.hash = b.hash WHERE b.hash = ?`;
export const BODY_CANDIDATE_EXISTS_SQL = `SELECT 1 AS present
  FROM content_blobs b JOIN content_blob_data data ON data.hash = b.hash WHERE b.hash = ?`;
type Candidate = { kind: string; byte_length: number };

export function assertTextBodyCandidateHash(hash: string) {
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('text_body_collection_invalid_hash');
}

// Safety comes from the holder checks (nothing references the hash) and the text-body kind. The stored bytes
// are not read or hashed: an unreferenced body is removed whatever it contains, and a damaged one must not
// block the save that released it.
function candidateLength(hash: string, row?: Candidate) {
  assertTextBodyCandidateHash(hash);
  if (!row || row.kind !== 'text_body') return null;
  return Number.isSafeInteger(row.byte_length) && row.byte_length >= 0 ? row.byte_length : 0;
}

/** Byte length of a stored text-body candidate, or null when the hash names no text body. */
export function textBodyCandidateLength(driver: DatabaseDriver, hash: string) {
  return candidateLength(hash, driver.queryOne<Candidate>(BODY_CANDIDATE_SQL, [hash]));
}

export async function textBodyCandidateLengthWithPort(port: DbPort, hash: string) {
  const [candidate] = await port.query<Candidate>(BODY_CANDIDATE_SQL, [hash]);
  return candidateLength(hash, candidate);
}
