// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { act, node, now, open, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it('eventually presents a due waiting topic while every preceding topic is repeatedly sent Soon', async () => {
  const [peer] = await setupPeers();
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic'); node(peer, 'waiting', 'topic');
  peer.db.prepare("UPDATE nodes SET created_at=? WHERE id='waiting'").run('2026-10-26T08:01:00.000Z');
  let session = await open(peer, now, settings(peer), 'reading-only');
  session = await act(peer, session, 'soon');
  session = await act(peer, session, 'soon');
  let reached = false;
  for (let step = 0; step < 6; step++) {
    session = await act(peer, session, 'soon', '2026-10-26T08:02:00.000Z');
    if (session.currentNodeId === 'waiting') { reached = true; break; }
  }
  expect(reached).toBe(true);
});
