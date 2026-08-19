export const OPAQUE_EVENT_REF_PREFIX = 'evt_';
export const OPAQUE_VERSION_REF_PREFIX = 'ver_';

export function createOpaqueEventRef(uuid: string) {
  return `${OPAQUE_EVENT_REF_PREFIX}${uuid}`;
}

export function createOpaqueVersionRef(uuid: string) {
  return `${OPAQUE_VERSION_REF_PREFIX}${uuid}`;
}

export function isOpaqueVersionRef(value: string) {
  return value.startsWith(OPAQUE_VERSION_REF_PREFIX);
}

export function isLegacyEncodedEventRef(value: string) {
  return value.includes('#') && !value.startsWith(OPAQUE_EVENT_REF_PREFIX);
}

export function rewriteStructuredRefs(value: string, refs: ReadonlyMap<string, string>) {
  try {
    return JSON.stringify(rewriteJsonValue(JSON.parse(value) as unknown, refs));
  } catch {
    return rewriteReferenceToken(value, refs);
  }
}

export function rewriteReferenceToken(value: string, refs: ReadonlyMap<string, string>) {
  const direct = refs.get(value);
  if (direct) return direct;
  for (const prefix of ['node:', 'review_log:']) {
    if (!value.startsWith(prefix)) continue;
    const replacement = refs.get(value.slice(prefix.length));
    if (replacement) return `${prefix}${replacement}`;
  }
  return value;
}

function rewriteJsonValue(value: unknown, refs: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return rewriteReferenceToken(value, refs);
  if (Array.isArray(value)) return value.map((item) => rewriteJsonValue(item, refs));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteJsonValue(item, refs)]));
}
