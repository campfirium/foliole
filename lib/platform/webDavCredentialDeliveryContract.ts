import { z } from 'zod';

import { webDavRelayLanBindingSchema } from './webDavRelayContract.js';

const publicKeySchema = z.string().regex(/^[A-Za-z0-9_-]{122}$/u);
const proofSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const webDavCredentialOfferSchema = z.object({
  id: z.string().uuid(),
  binding: webDavRelayLanBindingSchema,
  library_epoch: z.string().min(1).max(256),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  desktop_key: publicKeySchema
});
export type WebDavCredentialOffer = z.infer<typeof webDavCredentialOfferSchema>;

export const webDavCredentialReplySchema = z.object({
  id: z.string().uuid(),
  phone_key: publicKeySchema,
  confirmation: proofSchema.optional(),
  receipt: proofSchema.optional()
});
export type WebDavCredentialReply = z.infer<typeof webDavCredentialReplySchema>;

export const webDavCredentialDeliverySchema = z.object({
  offer: webDavCredentialOfferSchema,
  envelope: z.object({
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/u),
    ciphertext: z.string().min(22).max(100_000).regex(/^[A-Za-z0-9_-]+$/u)
  }).optional()
});
export type WebDavCredentialDelivery = z.infer<typeof webDavCredentialDeliverySchema>;
export type WebDavCredentialEnvelope = NonNullable<WebDavCredentialDelivery['envelope']>;

export function webDavCredentialTranscript(offer: WebDavCredentialOffer, phoneKey: string) {
  const binding = offer.binding;
  const fields = ['Foliole WebDAV credential delivery v1', offer.id, binding.id, binding.group_id,
    binding.desktop_device_id, binding.phone_device_id, binding.directory_url, offer.library_epoch, String(offer.version),
    offer.desktop_key, phoneKey];
  if (fields.some(value => /[\r\n]/u.test(value))) throw new Error('webdav_credential_offer_invalid');
  return fields.join('\n');
}
