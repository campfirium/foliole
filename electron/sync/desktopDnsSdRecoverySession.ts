import {
  startDesktopDnsSdSession,
  type DesktopDnsSdServiceChange,
  type DesktopDnsSdSession
} from './desktopDnsSd.js';

const RETRY_DELAYS_MS = [1_000, 3_000, 10_000] as const;
const STABLE_SESSION_MS = 30_000;

type Callbacks = {
  onError(error: Error): void;
  onService(event: DesktopDnsSdServiceChange): void;
  onStarted?(): void;
};

export interface RecoverableDesktopDnsSdSession extends DesktopDnsSdSession {
  recover(): void;
}

export function startRecoverableDesktopDnsSdSession(
  callbacks: Callbacks
): RecoverableDesktopDnsSdSession {
  return new DesktopDnsSdRecoveryController(callbacks).start();
}

class DesktopDnsSdRecoveryController implements RecoverableDesktopDnsSdSession {
  private active = true;
  private generation = 0;
  private failures = 0;
  private runtime: DesktopDnsSdSession | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly callbacks: Callbacks) {}

  start() {
    this.begin();
    return this;
  }

  recover() {
    if (!this.active) return;
    ++this.generation;
    this.clearTimers();
    this.runtime?.stop();
    this.runtime = null;
    this.failures = 0;
    this.begin();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    ++this.generation;
    this.clearTimers();
    this.runtime?.stop();
    this.runtime = null;
  }

  private begin() {
    const currentGeneration = ++this.generation;
    let failedDuringStart = false;
    try {
      const next = startDesktopDnsSdSession({
        onError: (error) => {
          failedDuringStart = true;
          this.failed(error, currentGeneration);
        },
        onService: (event) => {
          if (this.active && currentGeneration === this.generation) this.callbacks.onService(event);
        }
      });
      if (!this.active || failedDuringStart || currentGeneration !== this.generation) next.stop();
      else {
        this.runtime = next;
        this.callbacks.onStarted?.();
        this.stableTimer = setTimeout(() => {
          if (this.active && currentGeneration === this.generation) this.failures = 0;
        }, STABLE_SESSION_MS);
      }
    } catch (error) {
      this.failed(error instanceof Error ? error : new Error(String(error)), currentGeneration);
    }
  }

  private failed(error: Error, currentGeneration: number) {
    if (!this.active || currentGeneration !== this.generation) return;
    this.runtime?.stop();
    this.runtime = null;
    this.clearTimers();
    this.callbacks.onError(error);
    const delay = RETRY_DELAYS_MS[this.failures];
    this.failures += 1;
    if (delay === undefined) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.active && currentGeneration === this.generation) this.begin();
    }, delay);
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.retryTimer = null;
    this.stableTimer = null;
  }
}
