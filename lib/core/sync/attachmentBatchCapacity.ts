/** Four file reservations cover the active writer and every completion through SQL settlement. */
export class AttachmentBatchCapacity {
  private used = 0;
  private waiting: (() => void) | undefined;

  async reserve(signal: AbortSignal) {
    signal.throwIfAborted();
    while (this.used === 4) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { this.waiting = undefined; reject(signal.reason); };
        this.waiting = () => { signal.removeEventListener('abort', abort); resolve(); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
      });
      signal.throwIfAborted();
    }
    this.used++;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.used--;
      const waiting = this.waiting;
      this.waiting = undefined;
      waiting?.();
    };
  }
}
