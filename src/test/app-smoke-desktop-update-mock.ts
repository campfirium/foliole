import { vi } from 'vitest';

// Keep UI smoke tests independent from the live release manifest.
vi.mock('../app/hooks/useReleaseUpdateCheck', () => ({ useReleaseUpdateCheck: vi.fn() }));

vi.mock('../shared/platform/desktopUpdate', () => ({
  installDesktopUpdate: vi.fn(),
  readDesktopUpdateState: () => ({ phase: 'idle' }),
  subscribeDesktopUpdateState: () => () => undefined
}));
