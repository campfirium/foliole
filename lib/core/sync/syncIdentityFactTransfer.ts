import { z } from 'zod';

import type { DbRow } from './dbPort.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';

export const syncIdentityFactChunkSchema = z.object({ key: z.string().min(1).max(4096),
  offset: z.number().int().nonnegative(), total: z.number().int().positive()
}).strict().refine((value) => value.offset < value.total);

export const syncIdentityFactTransferSchema = z.object({
  section: z.enum(['versions', 'parents', 'reviews', 'head']),
  after: z.string().min(1).max(4096).nullable(),
  limit: z.number().int().min(1).max(64),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  chunk: syncIdentityFactChunkSchema.optional()
}).strict().refine((value) => value.section !== 'head' || (value.after === null && value.chunk === undefined));

export type SyncIdentityFactTransfer = z.infer<typeof syncIdentityFactTransferSchema>;

export const syncIdentityFactTailSchema = z.object({
  nextAfter: z.string().min(1).max(4096).nullable(),
  chunk: z.object({ key: z.string().min(1).max(4096), nextOffset: z.number().int().positive(),
    total: z.number().int().positive() }).strict().refine((value) => value.nextOffset < value.total).optional()
}).strict();

export function syncIdentityFactKey(section: SyncIdentityFactTransfer['section'], row: DbRow) {
  if (section === 'reviews' && typeof row.op_id === 'string') return row.op_id;
  if (section === 'versions' && typeof row.version_id === 'string') return row.version_id;
  if (section === 'parents' && typeof row.version_id === 'string' && typeof row.parent_version_id === 'string' && Number.isSafeInteger(row.ordinal)) {
    return JSON.stringify([row.version_id, row.ordinal, row.parent_version_id]);
  }
  throw new Error('sync_identity_fact_row_invalid');
}

export function compareSyncIdentityFactKeys(section: SyncIdentityFactTransfer['section'],
  left: string, right: string) {
  if (section !== 'parents') return compareSyncIdentityText(left, right);
  const tuple = z.tuple([z.string(), z.number().int().nonnegative(), z.string()]);
  const a = tuple.parse(JSON.parse(left));
  const b = tuple.parse(JSON.parse(right));
  return compareSyncIdentityText(a[0], b[0]) || a[1] - b[1] || compareSyncIdentityText(a[2], b[2]);
}
