import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal'
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal'
];

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4(hostname: string) {
  if (!net.isIPv4(hostname)) return null;
  const parts = hostname.split('.').map((segment) => Number(segment));
  return parts.length === 4 ? parts : null;
}

function isIpv4InRange(parts: number[], prefix: number[]) {
  return prefix.every((value, index) => parts[index] === value);
}

function isBlockedIpv4Host(hostname: string) {
  const parts = parseIpv4(hostname);
  if (!parts) return false;
  const [first, second] = parts as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168 ||
    first === 100 && second >= 64 && second <= 127 ||
    first >= 224 ||
    isIpv4InRange(parts, [192, 0, 0]) ||
    isIpv4InRange(parts, [192, 0, 2]) ||
    isIpv4InRange(parts, [198, 18]) ||
    isIpv4InRange(parts, [198, 19]) ||
    isIpv4InRange(parts, [198, 51, 100]) ||
    isIpv4InRange(parts, [203, 0, 113])
  );
}

function isBlockedIpv6Host(hostname: string) {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  if (!net.isIPv6(normalized)) return false;
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe') && ['8', '9', 'a', 'b'].includes(normalized[2] ?? '')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('ff')) return true;
  if (normalized.startsWith('::ffff:')) {
    return isBlockedIpv4Host(normalized.slice('::ffff:'.length));
  }
  return false;
}

export function isAllowedRemoteImageHostname(hostname: string) {
  const normalized = stripIpv6Brackets(hostname.trim().toLowerCase());
  if (!normalized) return false;
  if (BLOCKED_HOSTNAMES.has(normalized)) return false;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return false;
  return !isBlockedIpv4Host(normalized) && !isBlockedIpv6Host(normalized);
}
