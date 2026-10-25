import { z } from 'zod';

export const identityVersionRowSchema = z.object({
  version_id: z.string().min(1), object_id: z.string().min(1),
  parent_version_id: z.string().nullable(), host_name: z.string(), created_at: z.string(),
  content_hash: z.string(), body_text: z.string().nullable(), snapshot_json: z.string()
}).strict();

export const identityParentRowSchema = z.object({
  version_id: z.string().min(1), parent_version_id: z.string().min(1),
  ordinal: z.number().int().nonnegative()
}).strict();

export const identityReviewRowSchema = z.object({
  id: z.string(), op_id: z.string().min(1), host_name: z.string(), node_id: z.string().min(1),
  grade: z.number().int().min(0).max(4), scheduler_version: z.string(), reviewed_at: z.string(),
  kind: z.enum(['review', 'reset', 'void']), voids_op_id: z.string().min(1).nullable()
}).strict().refine(row => row.kind === 'review'
  ? row.grade >= 1 && row.voids_op_id === null
  : row.grade === 0 && (row.kind === 'void' ? row.voids_op_id !== null : row.voids_op_id === null),
'Invalid review event');

export const REVIEW_FACT_COLUMNS = ['id', 'op_id', 'host_name', 'node_id', 'grade',
  'scheduler_version', 'reviewed_at', 'kind', 'voids_op_id'] as const;
