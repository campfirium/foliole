import { z } from 'zod';

export const SYNC_SESSION_PATH = '/companion/sync-session';
export const SYNC_SESSION_WAIT_MS = 20_000;
export const syncChangeMarkerSchema = z.object({
  instance: z.string().uuid(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
});
export type SyncChangeMarker = z.infer<typeof syncChangeMarkerSchema>;
const tierSchema = z.number().int().min(0).max(2);
/** `tier` is the server's own sync priority tier; `best` is the highest-priority device it knows of. */
export const syncSessionReplySchema = z.object({
  session: z.string().uuid(), marker: syncChangeMarkerSchema, changed: z.boolean(),
  tier: tierSchema.optional(), best: z.object({ device_id: z.string().min(1), tier: tierSchema }).optional()
});
export type SyncSessionReply = z.infer<typeof syncSessionReplySchema>;
// Every request may carry the sender's own tier so the server learns priority changes without polling.
export const syncSessionRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('open'), tier: tierSchema.optional() }),
  z.object({ operation: z.literal('wait'), session: z.string().uuid(), marker: syncChangeMarkerSchema, tier: tierSchema.optional() }),
  z.object({ operation: z.literal('complete'), session: z.string().uuid(), marker: syncChangeMarkerSchema, tier: tierSchema.optional() }),
  z.object({ operation: z.literal('close'), session: z.string().uuid(), tier: tierSchema.optional() })
]);
export type SyncSessionRequest = z.infer<typeof syncSessionRequestSchema>;
