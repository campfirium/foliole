export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertIdentity(platform: string, appId: string) {
  const expected = platform === 'android' ? 'com.foliole.android.acceptance'
    : platform === 'ios' ? ['com.foliole.ios.devworkflow', 'com.foliole.ios.t219capacity'] : null;
  requireValue(expected && (Array.isArray(expected) ? expected.includes(appId) : appId === expected),
    'T219 requires the fixed acceptance application');
}

export function assertDatabase(name: string, count: number) {
  requireValue([1000, 10000].includes(count) && name === `t219-capacity-${count}`,
    'T219 requires a fixed dedicated database');
}
