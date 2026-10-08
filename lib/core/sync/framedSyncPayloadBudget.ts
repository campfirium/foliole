export const FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const FRAMED_SYNC_RECEIPT_SLOT_BYTES = 1024 * 1024;

export type FramedSyncPayloadDirection = 'inbound' | 'outbound';
export type FramedSyncPayloadLease = Readonly<{ release(): void }>;
type AcquireInput = Readonly<{
  direction: FramedSyncPayloadDirection;
  bytes: number;
  signal?: AbortSignal;
}>;
type Waiter = {
  bytes: number;
  signal: AbortSignal | undefined;
  abort: () => void;
  resolve: (lease: FramedSyncPayloadLease) => void;
  reject: (error: Error) => void;
};
type DirectionState = { activeBytes: number; capacity: number; waiting: Waiter[] };

function aborted() {
  return new DOMException('Framed sync payload acquisition was cancelled.', 'AbortError');
}

/** One owner per local library, shared by every connection and both payload lines. */
export class FramedSyncPayloadBudget {
  private readonly directions: Record<FramedSyncPayloadDirection, DirectionState> = {
    inbound: { activeBytes: 0, capacity: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES, waiting: [] },
    outbound: { activeBytes: 0, capacity: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES, waiting: [] }
  };
  private readonly receipts: Record<FramedSyncPayloadDirection, DirectionState> = {
    inbound: { activeBytes: 0, capacity: FRAMED_SYNC_RECEIPT_SLOT_BYTES, waiting: [] },
    outbound: { activeBytes: 0, capacity: FRAMED_SYNC_RECEIPT_SLOT_BYTES, waiting: [] }
  };
  private closed = false;
  private resolveDrained!: () => void;
  readonly drained: Promise<void>;

  constructor() {
    this.drained = new Promise<void>((resolve) => { this.resolveDrained = resolve; });
  }

  async acquire(input: AcquireInput): Promise<FramedSyncPayloadLease> {
    return this.enqueue(input, this.directions);
  }

  /** Only transfer receipts may use this bounded lane, never inventory or business payloads. */
  async acquireReceipt(input: AcquireInput): Promise<FramedSyncPayloadLease> {
    return this.enqueue(input, this.receipts);
  }

  private async enqueue(input: AcquireInput, states: Record<FramedSyncPayloadDirection, DirectionState>) {
    if (input.direction !== 'inbound' && input.direction !== 'outbound') throw new Error('framed_sync_payload_direction_invalid');
    const state = states[input.direction];
    if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0 ||
        input.bytes > state.capacity) throw new Error('framed_sync_payload_size_invalid');
    if (this.closed) throw new Error('framed_sync_payload_budget_closed');
    if (input.signal?.aborted) throw aborted();
    return new Promise<FramedSyncPayloadLease>((resolve, reject) => {
      const waiter: Waiter = { bytes: input.bytes, signal: input.signal, resolve, reject,
        abort: () => this.cancel(state, waiter) };
      state.waiting.push(waiter);
      input.signal?.addEventListener('abort', waiter.abort, { once: true });
      if (input.signal?.aborted) this.cancel(state, waiter);
      else this.grant(state);
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const state of this.states()) {
      for (const waiter of state.waiting.splice(0)) {
        waiter.signal?.removeEventListener('abort', waiter.abort);
        waiter.reject(aborted());
      }
    }
    this.finishDrain();
  }

  dispose() { this.close(); }

  private cancel(state: DirectionState, waiter: Waiter) {
    const index = state.waiting.indexOf(waiter);
    if (index < 0) return;
    state.waiting.splice(index, 1);
    waiter.signal?.removeEventListener('abort', waiter.abort);
    waiter.reject(aborted());
    this.grant(state);
  }

  private grant(state: DirectionState) {
    while (!this.closed && state.waiting.length) {
      const waiter = state.waiting[0]!;
      if (waiter.signal?.aborted) {
        state.waiting.shift();
        waiter.signal.removeEventListener('abort', waiter.abort);
        waiter.reject(aborted());
        continue;
      }
      if (state.activeBytes + waiter.bytes > state.capacity) return;
      state.waiting.shift();
      waiter.signal?.removeEventListener('abort', waiter.abort);
      state.activeBytes += waiter.bytes;
      let released = false;
      waiter.resolve({ release: () => {
        if (released) return;
        released = true;
        state.activeBytes -= waiter.bytes;
        this.grant(state);
        this.finishDrain();
      } });
    }
  }

  private finishDrain() {
    if (this.closed && this.states().every(state => state.activeBytes === 0)) this.resolveDrained();
  }

  private states() { return [...Object.values(this.directions), ...Object.values(this.receipts)]; }
}
