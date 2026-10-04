import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sync Groups connect one user's mutually trusted devices. The shared group key
 * authenticates group-key possession, not a separate principal for each device.
 * Device IDs identify sync participants; they are not device-bound credentials.
 * Member removal manages sync membership and does not revoke a retained key.
 * Isolation from a compromised device or an ex-member retaining the key is outside
 * this model. Revisit the protocol if that isolation becomes a product requirement.
 */
export function verifyCompanionRequestSignature(args: {
  bodyText?: string;
  method: string;
  nonce: string;
  pathWithQuery: string;
  secret: string;
  signature: string;
  timestamp: string;
}) {
  const bodyHash = createHash('sha256').update(args.bodyText ?? '').digest('hex');
  const canonical = [
    args.method.toUpperCase(),
    args.pathWithQuery,
    args.timestamp,
    args.nonce,
    bodyHash
  ].join('\n');
  const expected = createHmac('sha256', args.secret).update(canonical).digest('hex');
  const actualBuffer = Buffer.from(args.signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
