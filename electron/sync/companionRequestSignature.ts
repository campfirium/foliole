import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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
