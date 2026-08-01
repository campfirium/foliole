const REDACTED_BODY_SAMPLE = '[redacted-body-sample]';
const REDACTED_PATH = '[redacted-path]';
const REDACTED_SECRET = '[redacted-secret]';
const REDACTED_STACK = '[redacted-stack]';
const REDACTED_URL = '[redacted-url]';

const SECRET_KEY_PATTERN = /(authorization|cookie|password|secret|signature|token)/iu;
const PATH_KEY_PATTERN = /(^path$|filepath|absolutePath|source_path|sourcePath|validatedURL)/iu;
const URL_KEY_PATTERN = /(url$|Url$|URL$|href|endpoint_url|resource_url)/u;
const BODY_SAMPLE_KEY_PATTERN = /(bodyTextSample|body_text_sample|sample|contentPreview|content_preview)/u;

const URL_VALUE_PATTERN = /\b(?:https?|file):\/\/[^\s"'<>]+/giu;
const UNIX_PATH_VALUE_PATTERN = /(^|[\s([{])\/(?:Users|home|mnt|tmp|var|etc|proc|sys|dev)\/[^\s"'<>)]*/gu;
const WINDOWS_PATH_VALUE_PATTERN = /\b[A-Z]:\\[^\s"'<>)]*/giu;
const INLINE_SECRET_VALUE_PATTERN = /\b(authorization|cookie|password|secret|signature|token)\b\s*[:=]\s*(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;

function redactStringValue(value: string) {
  return value
    .replace(URL_VALUE_PATTERN, REDACTED_URL)
    .replace(WINDOWS_PATH_VALUE_PATTERN, REDACTED_PATH)
    .replace(UNIX_PATH_VALUE_PATTERN, (match, prefix: string) => `${prefix}${REDACTED_PATH}`)
    .replace(INLINE_SECRET_VALUE_PATTERN, (_match, key: string) => `${key}=${REDACTED_SECRET}`);
}

function redactValueForKey(key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (SECRET_KEY_PATTERN.test(key)) return REDACTED_SECRET;
  if (key === 'stack') return REDACTED_STACK;
  if (BODY_SAMPLE_KEY_PATTERN.test(key)) return REDACTED_BODY_SAMPLE;
  if (PATH_KEY_PATTERN.test(key)) return REDACTED_PATH;
  if (URL_KEY_PATTERN.test(key)) return REDACTED_URL;
  return redactDiagnosticValue(value);
}

function redactArray(value: unknown[]) {
  return value.map((entry) => redactDiagnosticValue(entry));
}

function redactObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key, redactValueForKey(key, entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined)
  );
}

export function redactDiagnosticValue(value: unknown): unknown {
  if (typeof value === 'string') return redactStringValue(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return redactArray(value);
  return redactObject(value as Record<string, unknown>);
}

export function redactDiagnosticPayload(value: unknown): Record<string, unknown> {
  const redacted = redactDiagnosticValue(value);
  return redacted && typeof redacted === 'object' && !Array.isArray(redacted)
    ? redacted as Record<string, unknown>
    : {};
}
