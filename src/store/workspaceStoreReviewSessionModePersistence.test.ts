import { expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';

function createState() {
  return {
    ...useWorkspaceStore.getState(),
    ...createInitialWorkspaceState(new Date(2026, 2, 3, 10))
  };
}

it('restores an unexpired learning-day mode preference', () => {
  const now = new Date(2026, 2, 3, 10);
  const expiresAt = new Date(2026, 2, 4, 4).toISOString();
  const config = createWorkspaceStorePersistConfig(() => undefined, () => now);
  const current = createState();
  const partialized = config.partialize?.({
    ...current,
    reviewSessionMode: 'review-first',
    reviewSessionModeExpiresAt: expiresAt
  });

  const merged = config.merge?.(JSON.parse(JSON.stringify(partialized)), current);

  expect(partialized).toMatchObject({
    reviewSessionMode: 'review-first',
    reviewSessionModeExpiresAt: expiresAt
  });
  expect(merged).toMatchObject({
    reviewSessionMode: 'review-first',
    reviewSessionModeExpiresAt: expiresAt
  });
});

it('drops an expired learning-day mode preference during hydration', () => {
  const now = new Date(2026, 2, 4, 10);
  const current = createState();
  const merged = createWorkspaceStorePersistConfig(() => undefined, () => now).merge?.(
    {
      ...current,
      reviewSessionMode: 'reading-only',
      reviewSessionModeExpiresAt: new Date(2026, 2, 4, 4).toISOString()
    },
    current
  );

  expect(merged).toMatchObject({
    reviewSessionMode: 'recommended',
    reviewSessionModeExpiresAt: null
  });
});
