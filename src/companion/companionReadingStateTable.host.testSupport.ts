// Mutable host state shared with the table's vi.mock factories. Keep it free of app imports: the factories
// load it while the mocked modules are still being resolved.
import { vi } from 'vitest';

export const host = {
  platform: 'android',
  apply: vi.fn(async (target: unknown) => { void target; }),
  foreground: new Set<() => void>(),
  externalDocument: undefined as unknown,
  managed: null as unknown
};
