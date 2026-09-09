export const MEMBER_SYNC_TRAILING_WINDOW_MS = 5_000;
export const MEMBER_SYNC_FRESHNESS_MS = 60_000;

type Timer = ReturnType<typeof setTimeout>;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export interface MemberSyncCadence<Input> {
  requestImmediate(input: Input): Promise<unknown> | null;
  requestMutation(input: Input): Promise<unknown> | null;
  stop(): void;
  updateFreshness(next: { eligible: boolean; input: Input | null; lastActualSyncAt?: number }): void;
}

type CadenceArgs<Input> = {
  getActiveRun?: () => Promise<unknown> | null;
  now?: () => number;
  run: (input: Input) => Promise<unknown> | null;
};

class DefaultMemberSyncCadence<Input> implements MemberSyncCadence<Input> {
  private activeRun: Promise<unknown> | null = null;
  private eligible = false;
  private freshnessInput: Input | null = null;
  private freshnessTimer: Timer | null = null;
  private lastActualSyncAt = 0;
  private readonly now: () => number;
  private stopped = false;
  private trailingInput: Input | null = null;
  private trailingTimer: Timer | null = null;
  private trailingWindowUntil = 0;

  constructor(private readonly args: CadenceArgs<Input>) {
    this.now = args.now ?? (() => Date.now());
  }

  requestImmediate(input: Input) {
    if (this.stopped || !this.eligible) return null;
    const external = this.externalActiveRun();
    if (external) return external;
    return this.trackRun(this.args.run(input));
  }

  requestMutation(input: Input) {
    if (this.stopped || !this.eligible) return null;
    const external = this.externalActiveRun();
    if (external || this.now() < this.trailingWindowUntil) {
      this.trailingInput = input;
      if (external) void external.finally(() => this.scheduleTrailingCheck()).catch(() => undefined);
      this.scheduleTrailingCheck();
      return external;
    }
    return this.startMutationRun(input);
  }

  updateFreshness(next: { eligible: boolean; input: Input | null; lastActualSyncAt?: number }) {
    this.eligible = next.eligible;
    this.freshnessInput = next.input;
    if (next.lastActualSyncAt !== undefined && Number.isFinite(next.lastActualSyncAt)) {
      this.lastActualSyncAt = Math.max(
        this.lastActualSyncAt, Math.min(next.lastActualSyncAt, this.now())
      );
    }
    if (!this.eligible) this.clearTrailing();
    this.scheduleFreshness();
  }

  stop() {
    this.stopped = true;
    this.clearTrailing();
    this.clearTimer(this.freshnessTimer);
    this.freshnessTimer = null;
  }

  private clearTimer(timer: Timer | null) {
    if (timer) clearTimeout(timer);
  }

  private clearTrailing() {
    this.trailingInput = null;
    this.clearTimer(this.trailingTimer);
    this.trailingTimer = null;
  }

  private externalActiveRun() {
    return this.activeRun ?? this.args.getActiveRun?.() ?? null;
  }

  private scheduleFreshness() {
    this.clearTimer(this.freshnessTimer);
    this.freshnessTimer = null;
    if (this.stopped || !this.eligible || !this.freshnessInput) return;
    const dueAt = (this.lastActualSyncAt || this.now()) + MEMBER_SYNC_FRESHNESS_MS;
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, dueAt - this.now()));
    this.freshnessTimer = setTimeout(() => {
      this.freshnessTimer = null;
      if (this.freshnessInput && this.eligible) void this.requestImmediate(this.freshnessInput);
    }, delay);
  }

  private scheduleTrailingCheck() {
    this.clearTimer(this.trailingTimer);
    this.trailingTimer = null;
    if (!this.trailingInput || this.stopped) return;
    const delay = Math.max(0, this.trailingWindowUntil - this.now());
    this.trailingTimer = setTimeout(() => {
      this.trailingTimer = null;
      void this.flushTrailing();
    }, delay);
  }

  private async flushTrailing() {
    if (!this.trailingInput || this.stopped || !this.eligible) return;
    const external = this.externalActiveRun();
    if (external) {
      await external.catch(() => undefined);
      if (this.trailingInput) this.scheduleTrailingCheck();
      return;
    }
    if (this.now() < this.trailingWindowUntil) return this.scheduleTrailingCheck();
    const input = this.trailingInput;
    this.trailingInput = null;
    await this.startMutationRun(input);
  }

  private startMutationRun(input: Input) {
    this.trailingWindowUntil = this.now() + MEMBER_SYNC_TRAILING_WINDOW_MS;
    return this.requestImmediate(input);
  }

  private trackRun(run: Promise<unknown> | null) {
    if (!run) return null;
    const tracked = Promise.resolve(run).finally(() => {
      if (this.activeRun !== tracked) return;
      this.activeRun = null;
      this.lastActualSyncAt = this.now();
      this.scheduleFreshness();
      if (this.trailingInput) this.scheduleTrailingCheck();
    });
    this.activeRun = tracked;
    return tracked;
  }
}

export function createMemberSyncCadence<Input>(args: CadenceArgs<Input>): MemberSyncCadence<Input> {
  return new DefaultMemberSyncCadence(args);
}
