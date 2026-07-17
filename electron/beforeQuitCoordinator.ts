interface BeforeQuitEvent {
  preventDefault: () => void;
}

interface BeforeQuitCoordinatorOptions {
  prepare: () => void;
  flush: () => Promise<void>;
  onPrepareError: (error: unknown) => void;
  onFlushError: (error: unknown) => void;
  quit: () => void;
  scheduleQuit?: (quit: () => void) => void;
}

type QuitPhase = 'idle' | 'flushing' | 'ready';

export function createBeforeQuitCoordinator(options: BeforeQuitCoordinatorOptions) {
  let phase: QuitPhase = 'idle';
  const scheduleQuit = options.scheduleQuit ?? setImmediate;

  return (event: BeforeQuitEvent) => {
    if (phase === 'ready') return;

    event.preventDefault();
    if (phase === 'flushing') return;

    phase = 'flushing';
    try {
      options.prepare();
    } catch (error) {
      options.onPrepareError(error);
    }
    void options.flush()
      .catch(options.onFlushError)
      .finally(() => {
        phase = 'ready';
        scheduleQuit(options.quit);
      });
  };
}
