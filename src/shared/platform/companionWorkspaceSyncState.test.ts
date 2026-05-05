import { describe, expect, it } from 'vitest';

import { normalizeWorkspaceSyncState } from './companionWorkspaceSyncState';

describe('normalizeWorkspaceSyncState', () => {
  it('uses the latest full sync event when last sync metadata is missing', () => {
    const state = normalizeWorkspaceSyncState({
      endpoint_url: 'http://10.0.2.2:38641',
      sync_events: [
        {
          endpoint_url: 'http://10.0.2.2:38641',
          id: 'event-2',
          message: 'Sync fully completed.',
          occurred_at: '2026-04-29T02:18:00.000Z',
          status: 'completed'
        },
        {
          endpoint_url: 'http://10.0.2.2:38641',
          id: 'event-1',
          message: 'Auto sync started.',
          occurred_at: '2026-04-29T02:17:58.000Z',
          status: 'started'
        }
      ]
    });

    expect(state.last_synced_at).toBe('2026-04-29T02:18:00.000Z');
  });

  it('does not use legacy completed batch events as full sync metadata', () => {
    const state = normalizeWorkspaceSyncState({
      endpoint_url: 'http://10.0.2.2:38641',
      sync_events: [
        {
          endpoint_url: 'http://10.0.2.2:38641',
          id: 'event-2',
          message: 'Auto sync completed.',
          occurred_at: '2026-04-29T02:18:00.000Z',
          status: 'completed'
        }
      ]
    });

    expect(state.last_synced_at).toBeNull();
  });
});
