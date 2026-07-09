// @vitest-environment node
import { expect, it } from 'vitest';

import {
  capabilityForProtectedPath,
  isProtectedRouteCapabilityDisabled
} from './agentControlRouteCapabilities.js';

it('maps protected Agent Control routes to capability names', () => {
  expect(capabilityForProtectedPath('POST', '/agent-control/v1/materials/search')).toBe('materials.search');
  expect(capabilityForProtectedPath('POST', '/agent-control/v1/materials/list-children')).toBe('materials.listChildren');
  expect(capabilityForProtectedPath('POST', '/agent-control/v1/virtual-folders/read')).toBe('virtualFolders.read');
  expect(capabilityForProtectedPath('GET', '/agent-control/v1/health')).toBeNull();
});

it('detects disabled route capabilities without treating foundation routes as disabled', () => {
  const isEnabled = (capability: string) => capability !== 'materials.search';

  expect(isProtectedRouteCapabilityDisabled('materials.search', isEnabled)).toBe(true);
  expect(isProtectedRouteCapabilityDisabled('materials.read', isEnabled)).toBe(false);
  expect(isProtectedRouteCapabilityDisabled('foundation.capabilities', isEnabled)).toBe(false);
  expect(isProtectedRouteCapabilityDisabled(null, isEnabled)).toBe(false);
});
