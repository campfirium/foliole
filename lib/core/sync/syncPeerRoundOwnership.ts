export type SyncPeerRoundDirection = 'inbound' | 'outbound';
export type SyncPeerRoundLease = {
  readonly signal: AbortSignal;
  touch(): void;
  release(reason?: unknown): void;
};
type WaitingRound = {
  id: string;
  deadline: number;
  settle(lease: SyncPeerRoundLease | null, reason?: unknown): void;
};
type OwnedRound = {
  id: string;
  direction: SyncPeerRoundDirection;
  lease: SyncPeerRoundLease;
  idleDeadline: number;
  waiting: WaitingRound | null;
  schedule(): void;
};

/** One instance belongs to one open library; no ownership survives its lifetime. */
export function createSyncPeerRoundOwnership(idleTimeoutMs: number) {
  return new SyncPeerRoundOwnership(idleTimeoutMs);
}

class SyncPeerRoundOwnership {
  private readonly peers = new Map<string, OwnedRound>();
  private outboundPeer: string | null = null;
  private closed = false;

  constructor(private readonly idleTimeoutMs: number) {
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) throw new Error('sync_round_timeout_invalid');
  }

  private finishWaiting(round: OwnedRound, lease: SyncPeerRoundLease | null, reason?: unknown) {
    const waiting = round.waiting;
    round.waiting = null;
    if (waiting) {
      if (!lease) this.outboundPeer = null;
      waiting.settle(lease, reason);
    }
  }

  private acquire(peer: string, id: string, direction: SyncPeerRoundDirection): SyncPeerRoundLease | null {
    if (this.closed) throw new Error('sync_round_owner_closed');
    if (!peer || !id) throw new Error('sync_round_identity_missing');
    if (this.peers.has(peer) || (direction === 'outbound' && this.outboundPeer !== null)) return null;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const round: OwnedRound = { id, direction, idleDeadline: 0, waiting: null,
      schedule: () => {
        clearTimeout(timer);
        const deadline = Math.min(round.idleDeadline, round.waiting?.deadline ?? Infinity);
        timer = setTimeout(() => {
          if (round.waiting && round.waiting.deadline <= Date.now() && round.idleDeadline > Date.now()) {
            this.finishWaiting(round, null, new Error('sync_round_wait_expired'));
          }
          if (round.idleDeadline <= Date.now()) round.lease.release(new Error('sync_round_expired'));
          else round.schedule();
        }, Math.max(0, deadline - Date.now()));
      },
      lease: {
        signal: controller.signal,
        touch: () => {
          controller.signal.throwIfAborted();
          round.idleDeadline = Date.now() + this.idleTimeoutMs;
          round.schedule();
        },
        release: (reason = new Error('sync_round_released')) => {
          clearTimeout(timer);
          if (this.peers.get(peer) === round) {
            this.peers.delete(peer);
            if (direction === 'outbound' || round.waiting) this.outboundPeer = null;
            // Reserve the successor before abort listeners or another inbound start can run.
            const successor = round.waiting && !this.closed ? this.acquire(peer, round.waiting.id, 'outbound') : null;
            this.finishWaiting(round, successor, reason);
          }
          if (!controller.signal.aborted) controller.abort(reason);
        }
      }
    };
    this.peers.set(peer, round);
    if (direction === 'outbound') this.outboundPeer = peer;
    round.lease.touch();
    return round.lease;
  }

  waitForInbound(peer: string, id: string, signal?: AbortSignal, onWaiting?: (waiting: boolean) => void) {
    signal?.throwIfAborted();
    const immediate = this.acquire(peer, id, 'outbound');
    if (immediate) return Promise.resolve(immediate);
    const round = this.peers.get(peer);
    if (!round || round.direction !== 'inbound' || this.outboundPeer !== null) throw new Error('sync_round_busy');
    return new Promise<SyncPeerRoundLease>((resolve, reject) => {
      const cancel = () => {
        this.finishWaiting(round, null, signal?.reason);
        round.schedule();
      };
      round.waiting = { id, deadline: round.idleDeadline,
        settle(lease, reason) {
          signal?.removeEventListener('abort', cancel);
          onWaiting?.(false);
          if (lease) resolve(lease);
          else reject(reason);
        }
      };
      this.outboundPeer = peer;
      signal?.addEventListener('abort', cancel, { once: true });
      round.schedule();
      onWaiting?.(true);
      if (signal?.aborted) cancel();
    });
  }

  acquireOutbound(peer: string, id: string) { return this.acquire(peer, id, 'outbound'); }

  touch(peer: string, id: string, direction: SyncPeerRoundDirection) {
    touchOwnedRound(this.peers.get(peer), id, direction);
  }

  acceptInbound(peer: string, id: string, startsRound: boolean) {
    const current = this.peers.get(peer);
    if (current?.direction === 'inbound' && current.id === id) {
      current.lease.touch();
      return current.lease;
    }
    if (current) throw new Error('sync_round_busy');
    if (!startsRound) throw new Error('sync_round_expired');
    const lease = this.acquire(peer, id, 'inbound');
    if (!lease) throw new Error('sync_round_busy');
    return lease;
  }

  finishInbound(peer: string, id: string) {
    const current = this.peers.get(peer);
    if (current?.direction === 'inbound' && current.id === id) current.lease.release();
  }

  close(reason: unknown = new Error('sync_round_owner_closed')) {
    this.closed = true;
    for (const round of [...this.peers.values()]) round.lease.release(reason);
  }
}

function touchOwnedRound(current: OwnedRound | undefined, id: string, direction: SyncPeerRoundDirection) {
  if (!current || current.id !== id || current.direction !== direction) throw new Error('sync_round_expired');
  current.lease.touch();
}
