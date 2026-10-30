// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./desktopPeerSessionHttp.js', () => ({ requestDesktopPeerSyncSession: vi.fn(async () => ({})) }));

import { requestDesktopPeerSyncSession } from './desktopPeerSessionHttp.js';
import { captureDesktopPeerRoundCompletion, desktopPeerSessionRegistry,
  type DesktopPeerSession } from './desktopPeerSessionRegistry.js';

const peerId = 'upstream';
const marker = { instance: 'a1111111-1111-4111-8111-111111111111', sequence: 7 };
function session(): DesktopPeerSession {
  return { peer: { peer_device_id: peerId } as DesktopPeerSession['peer'], controller: new AbortController(),
    reply: { session: 'b1111111-1111-4111-8111-111111111111', marker, changed: true } };
}
afterEach(() => { desktopPeerSessionRegistry.clear(); vi.clearAllMocks(); });

it('acknowledges only the change marker observed before this round', async () => {
  const current = session();
  desktopPeerSessionRegistry.set(peerId, current);
  const complete = captureDesktopPeerRoundCompletion(peerId);
  current.reply = { ...current.reply, marker: { ...marker, sequence: 8 } };
  await complete();
  expect(requestDesktopPeerSyncSession).toHaveBeenCalledWith(current.peer, {
    operation: 'complete', session: current.reply.session, marker
  }, current.controller.signal);
});
it.each(['closed', 'replaced', 'aborted'])('does not confirm an old %s session', async state => {
  const current = session();
  desktopPeerSessionRegistry.set(peerId, current);
  const complete = captureDesktopPeerRoundCompletion(peerId);
  if (state === 'closed') desktopPeerSessionRegistry.delete(peerId);
  else if (state === 'replaced') desktopPeerSessionRegistry.set(peerId, session());
  else current.controller.abort();
  await complete();
  expect(requestDesktopPeerSyncSession).not.toHaveBeenCalled();
});
it('does not manufacture an acknowledgement without a held upstream session', async () => {
  await captureDesktopPeerRoundCompletion(peerId)();
  expect(requestDesktopPeerSyncSession).not.toHaveBeenCalled();
});
