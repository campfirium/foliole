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
  grade: z.number(), scheduler_version: z.string(), reviewed_at: z.string(), due_before: z.string().nullable(),
  stability_before: z.number().nullable(), difficulty_before: z.number().nullable(), due_after: z.string(),
  stability_after: z.number(), difficulty_after: z.number()
}).strict();
