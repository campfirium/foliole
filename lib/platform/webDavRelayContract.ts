import { z } from 'zod';

export const WEB_DAV_ATTACHMENT_MIB = 1024 * 1024;
export const MAX_WEB_DAV_ATTACHMENT_MIB = Math.floor(Number.MAX_SAFE_INTEGER / WEB_DAV_ATTACHMENT_MIB);
export const webDavAttachmentPolicySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('off') }),
  z.object({ mode: z.literal('unlimited') }),
  z.object({ mode: z.literal('limited'), max_mib: z.number().int().min(1).max(MAX_WEB_DAV_ATTACHMENT_MIB) })
]);
export type WebDavAttachmentPolicy = z.infer<typeof webDavAttachmentPolicySchema>;
export const DEFAULT_WEB_DAV_ATTACHMENT_POLICY = { mode: 'unlimited' } as const;

export function sameWebDavAttachmentPolicy(left?: WebDavAttachmentPolicy, right?: WebDavAttachmentPolicy) {
  const a = left ?? DEFAULT_WEB_DAV_ATTACHMENT_POLICY;
  const b = right ?? DEFAULT_WEB_DAV_ATTACHMENT_POLICY;
  return a.mode === b.mode && (a.mode !== 'limited' || (b.mode === 'limited' && a.max_mib === b.max_mib));
}

export const webDavRelayLanBindingSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().min(1),
  desktop_device_id: z.string().min(1),
  phone_device_id: z.string().min(1),
  directory_url: z.url({ protocol: /^https?$/ }),
  attachment_policy: webDavAttachmentPolicySchema.optional()
});

export const webDavRelayBindingSchema = webDavRelayLanBindingSchema.extend({
  credential_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()
}).refine(binding => binding.credential_version === undefined || /^https:\/\//iu.test(binding.directory_url));

export type WebDavRelayBinding = z.infer<typeof webDavRelayBindingSchema>;

export const WEB_DAV_USAGE_PERIOD_MINUTES = { tenMinutes: 10, halfHour: 30, hour: 60 } as const;

export type WebDavUsagePeriod = keyof typeof WEB_DAV_USAGE_PERIOD_MINUTES;

const webDavUsageTotalsSchema = z.object({
  requests: z.number().int().nonnegative(),
  uploadedBytes: z.number().int().nonnegative(),
  downloadedBytes: z.number().int().nonnegative()
});

const webDavUsageSchema = z.object({
  measuredAt: z.number().int().nonnegative(),
  tenMinutes: webDavUsageTotalsSchema,
  halfHour: webDavUsageTotalsSchema,
  hour: webDavUsageTotalsSchema
});

export type WebDavUsage = z.infer<typeof webDavUsageSchema>;

export const webDavRelayOverviewSchema = z.object({
  configured: z.boolean(),
  device_id: z.string().min(1).nullable(),
  delivered: z.boolean(),
  credential_draft_available: z.boolean().optional(),
  credential_active: z.boolean().optional(),
  credential_offline_rotation_available: z.boolean().optional(),
  credential_delivery: z.object({
    id: z.string().uuid(), device_id: z.string(), fingerprint: z.string().optional(),
    desktop_confirmed: z.boolean(), phone_confirmed: z.boolean(), automatic: z.boolean().optional(), queued: z.boolean().optional()
  }).optional(),
  attachment_policy: webDavAttachmentPolicySchema.optional(),
  published_via_relay: z.boolean().optional(),
  lan_baseline_required: z.boolean().optional(),
  available_device_ids: z.array(z.string().min(1)).optional(),
  usage: webDavUsageSchema.nullish()
});

export type WebDavRelayOverview = z.infer<typeof webDavRelayOverviewSchema>;
