import { z } from 'zod';

export const parentOrderHistoryArgsSchema = z.object({
  parentId: z.string().min(1).max(256),
  afterVersionId: z.string().max(256).default(''),
  limit: z.number().int().min(1).max(128).default(32)
}).strict();

export const restoreParentOrderArgsSchema = z.object({
  parentId: z.string().min(1).max(256),
  versionId: z.string().min(1).max(256)
}).strict();

export type NativeParentOrderHistory = Awaited<ReturnType<
  typeof import('../core/sync/syncParentOrderVersionStore.js').readParentOrderVersionPage>> & {
    currentVersionId: string | null;
  };
