// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { requestSyncPeerRoundPath } from '../../lib/core/sync/requestSyncPeerRound.ts';
import { runSyncPeerRound } from '../../lib/core/sync/runSyncPeerRound.ts';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.ts';

import { createIosForegroundSyncLifecycleObservations, createIosForegroundSyncLifecycleService } from './ios-foreground-sync-lifecycle-service.ts';

function fixture() {
  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-lifecycle-request-'));
  const observations = createIosForegroundSyncLifecycleObservations();
  const forward = vi.fn(async () => ({ body: 'current response', contentType: 'application/octet-stream' }));
  const route = createIosForegroundSyncLifecycleService({ artifactDir, observations, route: forward });
  return { observations, forward, route,
    phase: value => fs.writeFileSync(path.join(artifactDir, 'lifecycle-control.json'), JSON.stringify({ phase: value })),
    close: () => fs.rmSync(artifactDir, { recursive: true }) };
}
const request = url => ({ bodyText: '', method: 'POST', url });

it('counts only start, forwards continue/finish and legacy paths without injecting a failure', async () => {
  const f = fixture();
  try {
    f.phase('failed-resume');
    for (const mode of ['continue', 'finish', 'single']) {
      await expect(f.route(request(`/companion/framed-sync?request=inventory&peer_round_id=id&peer_round_mode=${mode}`)))
        .resolves.toMatchObject({ body: 'current response' });
    }
    await f.route({ bodyText: '', method: 'GET', url: '/companion/sync-pack?after_state_seq=0' });
    expect(f.observations.request_count).toBe(0);
    expect(f.forward).toHaveBeenCalledTimes(4);
  } finally { f.close(); }
});

it('fails 503 once per actual run and releases ownership before the next foreground run', async () => {
  const f = fixture();
  const owner = createSyncPeerRoundOwnership(5000);
  const run = () => runSyncPeerRound({ owner, peerId: 'provider', execute: async (id, lease) => {
    const round = { id, lease, admitted: false };
    const response = await f.route(request(requestSyncPeerRoundPath('/companion/framed-sync?request=inventory', round)));
    if (response.status === 503) throw new Error('framed_sync_http_503');
    round.admitted = true;
    await f.route(request(requestSyncPeerRoundPath('/companion/framed-sync?request=attachments', round)));
  } });
  try {
    f.phase('failed-resume');
    await expect(run()).rejects.toThrow('framed_sync_http_503');
    expect(f.observations).toMatchObject({ request_count: 1, failed_requests: 1, active_requests: 0 });
    f.phase('endpoint-ready');
    await run();
    expect(f.observations).toMatchObject({ request_count: 2, completed_requests: 1, max_concurrency: 1 });
    expect(new Set(f.observations.requests.map(row => row.peer_round_id)).size).toBe(2);
  } finally { owner.close(); f.close(); }
});

it('holds the recovery boundary through delay and the real callback, then records a failure honestly', async () => {
  const f = fixture();
  vi.useFakeTimers();
  try {
    f.phase('recovered-resume');
    const execute = vi.fn(async () => { throw new Error('provider failure'); });
    const work = f.route(request('/companion/framed-sync?request=inventory&peer_round_id=id&peer_round_mode=start'), execute);
    const failure = expect(work).rejects.toThrow('provider failure');
    expect(f.observations.active_requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1499);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(execute).toHaveBeenCalledOnce();
    expect(f.forward).not.toHaveBeenCalled();
    expect(f.observations).toMatchObject({ active_requests: 0, failed_requests: 1, completed_requests: 0 });
    expect(f.observations.requests[0]).toMatchObject({ status: 'failed', peer_round_id: 'id' });
  } finally { vi.useRealTimers(); f.close(); }
});
