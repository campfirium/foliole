import { z } from 'zod';

export const webDavRelayBindingSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().min(1),
  desktop_device_id: z.string().min(1),
  phone_device_id: z.string().min(1),
  directory_url: z.url({ protocol: /^https?$/ })
});

export type WebDavRelayBinding = z.infer<typeof webDavRelayBindingSchema>;

export const webDavRelayOverviewSchema = z.object({
  configured: z.boolean(),
  device_id: z.string().min(1).nullable(),
  delivered: z.boolean()
});
