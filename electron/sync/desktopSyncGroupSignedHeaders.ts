import { createHash, createHmac, randomUUID } from 'node:crypto';

export function createDesktopSyncGroupSignedHeaders(args: {
  body?: string;
  bodySha256?: string;
  groupId: string;
  localDeviceId: string;
  method: string;
  pathWithQuery: string;
  secret: string;
}) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  if (args.body !== undefined && args.bodySha256 !== undefined) {
    throw new Error('sync_group_request_body_hash_ambiguous');
  }
  if (args.bodySha256 !== undefined && !/^[0-9a-f]{64}$/u.test(args.bodySha256)) {
    throw new Error('sync_group_request_body_hash_invalid');
  }
  const bodyHash = args.bodySha256 ?? createHash('sha256').update(args.body ?? '').digest('hex');
  const canonical = [args.method.toUpperCase(), args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Device-Id': args.localDeviceId,
    'X-Nonce': nonce,
    'X-Signature': createHmac('sha256', args.secret).update(canonical).digest('hex'),
    'X-Sync-Group-Id': args.groupId,
    'X-Timestamp': timestamp
  };
}
