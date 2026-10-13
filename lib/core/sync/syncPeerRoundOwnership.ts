export type SyncPeerRoundDirection = 'inbound' | 'outbound';
export type SyncPeerRoundLease = {
  readonly signal: AbortSignal;
  touch(): void;
  release(reason?: unknown): void;
};

type OwnedRound = {
  id: string;
  direction: SyncPeerRoundDirection;
  lease: SyncPeerRoundLease;
};

/** One instance belongs to one open library; no ownership survives its lifetime. */
export function createSyncPeerRoundOwnership(idleTimeoutMs: number) {
  validateIdleTimeout(idleTimeoutMs);
  const peers = new Map<string, OwnedRound>();
  let outboundPeer: string | null = null;
  let closed = false;

  function acquire(peer: string, id: string, direction: SyncPeerRoundDirection): SyncPeerRoundLease | null {
    if (closed) throw new Error('sync_round_owner_closed');
    if (!peer || !id) throw new Error('sync_round_identity_missing');
    if (peers.has(peer) || (direction === 'outbound' && outboundPeer !== null)) return null;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const lease: SyncPeerRoundLease = {
      signal: controller.signal,
      touch() {
        controller.signal.throwIfAborted();
        clearTimeout(timer);
        timer = setTimeout(() => lease.release(new Error('sync_round_expired')), idleTimeoutMs);
      },
      release(reason = new Error('sync_round_released')) {
        clearTimeout(timer);
        if (peers.get(peer)?.lease === lease) {
          peers.delete(peer);
          if (direction === 'outbound') outboundPeer = null;
        }
        if (!controller.signal.aborted) controller.abort(reason);
      }
    };
    peers.set(peer, { id, direction, lease });
    if (direction === 'outbound') outboundPeer = peer;
    lease.touch();
    return lease;
  }

  return {
    acquireOutbound: (peer: string, id: string) => acquire(peer, id, 'outbound'),
    touch: (peer: string, id: string, direction: SyncPeerRoundDirection) => touchOwnedRound(peers.get(peer), id, direction),
    acceptInbound(peer: string, id: string, startsRound: boolean) {
      const current = peers.get(peer);
      if (current?.direction === 'inbound' && current.id === id) {
        current.lease.touch();
        return current.lease;
      }
      if (current) throw new Error('sync_round_busy');
      if (!startsRound) throw new Error('sync_round_expired');
      const lease = acquire(peer, id, 'inbound');
      if (!lease) throw new Error('sync_round_busy');
      return lease;
    },
    finishInbound(peer: string, id: string) {
      const current = peers.get(peer);
      if (current?.direction === 'inbound' && current.id === id) current.lease.release();
    },
    close(reason: unknown = new Error('sync_round_owner_closed')) {
      closed = true;
      for (const round of [...peers.values()]) round.lease.release(reason);
    }
  };
}

function validateIdleTimeout(idleTimeoutMs: number) {
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
    throw new Error('sync_round_timeout_invalid');
  }
}

function touchOwnedRound(current: OwnedRound | undefined, id: string, direction: SyncPeerRoundDirection) {
  if (!current || current.id !== id || current.direction !== direction) throw new Error('sync_round_expired');
  current.lease.touch();
}
