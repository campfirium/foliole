import { expect, it } from 'vitest';

import { isAssistantScrollNearBottom } from './useWorkspaceRightSidebarAssistantScroll';

it('distinguishes the reading position from the latest-message region', () => {
  expect(isAssistantScrollNearBottom({ clientHeight: 300, scrollHeight: 1000, scrollTop: 652 })).toBe(true);
  expect(isAssistantScrollNearBottom({ clientHeight: 300, scrollHeight: 1000, scrollTop: 500 })).toBe(false);
});
