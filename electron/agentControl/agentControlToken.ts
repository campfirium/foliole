import crypto from 'node:crypto';

const TOKEN_BYTES = 32;

export function createAgentControlToken(randomBytes: typeof crypto.randomBytes = crypto.randomBytes) {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isBearerTokenAuthorized(header: string | string[] | undefined, expectedToken: string) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) {
    return false;
  }
  const token = value.slice('Bearer '.length);
  const actual = Buffer.from(token, 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
