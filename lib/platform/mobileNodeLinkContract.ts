const MAX_URL_LENGTH = 512;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface MobileNodeLocator {
  version: 1;
  groupId: string;
  nodeId: string;
}

export function parseMobileNodeLink(raw: unknown): MobileNodeLocator | null {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH ||
      !raw.startsWith('foliole://node/v1?') || /[\s#]/u.test(raw)) return null;
  const params = new URLSearchParams(raw.slice('foliole://node/v1?'.length));
  if ([...params.keys()].sort().join(',') !== 'group,id') return null;
  const groupId = params.get('group');
  const nodeId = params.get('id');
  if (!groupId || !nodeId || !OPAQUE_ID.test(groupId) || !OPAQUE_ID.test(nodeId)) return null;
  return { version: 1, groupId, nodeId };
}

export function buildMobileNodeLink(locator: Omit<MobileNodeLocator, 'version'>): string {
  if (!OPAQUE_ID.test(locator.groupId) || !OPAQUE_ID.test(locator.nodeId)) {
    throw new Error('invalid_mobile_node_locator');
  }
  const params = new URLSearchParams({ group: locator.groupId, id: locator.nodeId });
  return `foliole://node/v1?${params.toString()}`;
}
