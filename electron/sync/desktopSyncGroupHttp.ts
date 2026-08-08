import { createHash, createHmac, randomUUID } from 'node:crypto';

export async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `http_${response.status}`);
  return payload;
}

export function createDesktopSyncGroupSignedHeaders(args: {
  body?: string;
  groupId: string;
  localDeviceId: string;
  method: string;
  pathWithQuery: string;
  secret: string;
}) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const bodyHash = createHash('sha256').update(args.body ?? '').digest('hex');
  const canonical = [args.method.toUpperCase(), args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Device-Id': args.localDeviceId,
    'X-Nonce': nonce,
    'X-Signature': createHmac('sha256', args.secret).update(canonical).digest('hex'),
    'X-Sync-Group-Id': args.groupId,
    'X-Timestamp': timestamp
  };
}
