import { z } from 'zod';

export const SYNC_SESSION_PATH = '/companion/sync-session';
export const SYNC_SESSION_WAIT_MS = 20_000;
export const syncChangeMarkerSchema = z.object({
  instance: z.string().uuid(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
});
export type SyncChangeMarker = z.infer<typeof syncChangeMarkerSchema>;
export const syncSessionReplySchema = z.object({
  session: z.string().uuid(), marker: syncChangeMarkerSchema, changed: z.boolean()
});
export type SyncSessionReply = z.infer<typeof syncSessionReplySchema>;
export const syncSessionRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('open') }),
  z.object({ operation: z.literal('wait'), session: z.string().uuid(), marker: syncChangeMarkerSchema }),
  z.object({ operation: z.literal('complete'), session: z.string().uuid(), marker: syncChangeMarkerSchema }),
  z.object({ operation: z.literal('close'), session: z.string().uuid() })
]);
export type SyncSessionRequest = z.infer<typeof syncSessionRequestSchema>;
