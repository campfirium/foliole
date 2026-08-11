import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  createIosStateWritebackAcceptanceService,
  createIosStateWritebackObservations
} from './ios-state-writeback-acceptance-service.ts';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
});

it('routes push and confirmation pack through one isolated desktop fixture', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-state-service-'));
  const observations = createIosStateWritebackObservations();
  const service = await createIosStateWritebackAcceptanceService({
    observations,
    outputDirectory: tempRoot,
    toPeerId: 'ios-device'
  });
  try {
    const diagnostics = await service.route({
      bodyText: '', method: 'GET', url: '/companion/diagnostics/sync'
    });
    const item = {
      base: { baseContentHash: null, kind: 'content_hash' },
      clientOpId: 'node_reading:ios-state-node:1',
      contentHash: 'reading-hash',
      deletedAt: null,
      identity: { objectId: 'ios-state-node', objectType: 'node_reading', scope: 'workspace' },
      payloadJson: JSON.stringify({
        interval_duration_ms: 120000, interval_growth_factor: 1.5,
        last_handled_at: '2026-07-21T00:01:00.000Z', next_at: '2026-07-22T00:00:00.000Z',
        priority: 3, repetition_count: 2, state: 'active'
      }),
      updatedAt: '2026-07-21T00:01:00.000Z'
    };
    const push = await service.route({
      bodyText: JSON.stringify({ items: [item] }),
      method: 'POST',
      url: '/companion/sync-push'
    });
    const pack = await service.route({ bodyText: '', method: 'GET', url: '/companion/sync-pack?after_state_seq=0' });

    expect(JSON.parse(String(diagnostics?.body))).toEqual({ sync_state: { max_state_seq: 1 } });
    expect(diagnostics?.contentType).toBe('application/json');
    expect(JSON.parse(String(push?.body))).toMatchObject({ acks: [{ status: 'accepted' }] });
    expect(pack).toMatchObject({ contentType: 'application/vnd.foliole.sync-pack' });
    expect(Buffer.isBuffer(pack?.body)).toBe(true);
    expect(observations).toEqual({
      ack_statuses: ['accepted'],
      last_push_items: [{ object_type: 'node_reading', payload_json: item.payloadJson }],
      pack_requests: 1,
      push_requests: 1,
      pushed_object_types: ['node_reading']
    });
  } finally {
    service.close();
  }
});
