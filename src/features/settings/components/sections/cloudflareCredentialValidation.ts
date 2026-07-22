const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/iu;
const API_TOKEN_PATTERN = /^[a-z0-9_-]{40,80}$/iu;

export function isCloudflareAccountId(value: string) {
  return ACCOUNT_ID_PATTERN.test(value);
}

export function isCloudflareApiToken(value: string) {
  return API_TOKEN_PATTERN.test(value);
}
