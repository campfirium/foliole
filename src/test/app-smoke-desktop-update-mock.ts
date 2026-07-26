import { vi } from 'vitest';

vi.mock('../shared/platform/desktopUpdate', () => ({
  installDesktopUpdate: vi.fn(),
  readDesktopUpdateState: () => ({ phase: 'idle' }),
  subscribeDesktopUpdateState: () => () => undefined
}));
