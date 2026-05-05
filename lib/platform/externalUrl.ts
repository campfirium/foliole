const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(['http:', 'https:']);

export function normalizeOpenExternalUrl(target: string) {
  const trimmedTarget = target.trim();
  try {
    const url = new URL(trimmedTarget);
    return ALLOWED_EXTERNAL_URL_PROTOCOLS.has(url.protocol) ? trimmedTarget : null;
  } catch {
    return null;
  }
}
