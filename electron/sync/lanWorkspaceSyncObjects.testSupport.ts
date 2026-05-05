import crypto from 'node:crypto';

export function signRequest(args: {
  bodyText?: string;
  deviceId: string;
  method: string;
  pathWithQuery: string;
  secret: string;
}) {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(args.bodyText ?? '').digest('hex');
  const canonical = [args.method, args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Device-Id': args.deviceId,
    'X-Nonce': nonce,
    'X-Signature': crypto.createHmac('sha256', args.secret).update(canonical).digest('hex'),
    'X-Timestamp': timestamp
  };
}

export async function postSigned(
  endpoint: string,
  pathWithQuery: string,
  bodyText: string,
  paired: { device_id: string; device_secret: string }
) {
  return await fetch(`${endpoint}${pathWithQuery}`, {
    body: bodyText,
    headers: {
      'Content-Type': 'application/json',
      ...signRequest({ bodyText, deviceId: paired.device_id, method: 'POST', pathWithQuery, secret: paired.device_secret })
    },
    method: 'POST'
  });
}
