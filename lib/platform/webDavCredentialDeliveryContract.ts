import { z } from 'zod';

import { webDavRelayLanBindingSchema } from './webDavRelayContract.js';

const publicKeySchema = z.string().regex(/^[A-Za-z0-9_-]{122}$/u);
const signatureSchema = z.string().regex(/^[A-Za-z0-9_-]{10,100}$/u);
const proofSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const webDavCredentialOfferSchema = z.object({
  id: z.string().uuid(),
  binding: webDavRelayLanBindingSchema,
  library_epoch: z.string().min(1).max(256),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  desktop_key: publicKeySchema,
  desktop_identity: z.object({ public_key: publicKeySchema, library_epoch: z.string().min(1).max(256) }).optional(),
  desktop_identity_proof: signatureSchema.optional()
});
export type WebDavCredentialOffer = z.infer<typeof webDavCredentialOfferSchema>;

export const webDavCredentialReplySchema = z.object({
  id: z.string().uuid(),
  phone_key: publicKeySchema,
  phone_identity_key: publicKeySchema.optional(),
  phone_identity_proof: signatureSchema.optional(),
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

export function webDavCredentialTranscript(offer: WebDavCredentialOffer, phoneKey: string, phoneIdentityKey?: string) {
  const binding = offer.binding;
  const identity = phoneIdentityKey ? offer.desktop_identity : undefined;
  if (phoneIdentityKey && !identity) throw new Error('webdav_credential_offer_invalid');
  const fields = [identity ? 'Foliole WebDAV credential delivery v2' : 'Foliole WebDAV credential delivery v1', offer.id, binding.id, binding.group_id,
    binding.desktop_device_id, binding.phone_device_id, binding.directory_url, offer.library_epoch, String(offer.version),
    offer.desktop_key, phoneKey];
  if (identity && phoneIdentityKey) fields.push(identity.library_epoch, identity.public_key, phoneIdentityKey);
  if (offer.desktop_identity_proof) fields.push('automatic rotation');
  if (fields.some(value => /[\r\n]/u.test(value))) throw new Error('webdav_credential_offer_invalid');
  return fields.join('\n');
}

export function webDavCredentialRotationChallenge(offer: WebDavCredentialOffer, phoneIdentityKey: string) {
  const unsigned = { ...offer, desktop_identity_proof: undefined };
  return `${webDavCredentialTranscript(unsigned, '', phoneIdentityKey)}\nverify desktop for automatic rotation`;
}

const peerIdentitySchema = z.object({
  binding_id: z.string().uuid(), library_epoch: z.string(), peer_library_epoch: z.string(), public_key: publicKeySchema
});

export function matchingWebDavCredentialPeerKey(input: unknown, bindingId: string, epoch: string, peerEpoch: string) {
  const peer = peerIdentitySchema.safeParse(input).data;
  return peer?.binding_id === bindingId && peer.library_epoch === epoch && peer.peer_library_epoch === peerEpoch
    ? peer.public_key : undefined;
}
