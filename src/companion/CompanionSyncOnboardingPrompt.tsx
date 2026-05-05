export function CompanionSyncOnboardingPrompt(props: {
  onDismiss(): Promise<unknown>;
  onStart(): Promise<unknown>;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <main className="fixed inset-0 z-50 flex min-h-dvh items-center bg-companion-base px-6 py-10 text-foreground">
      <section className="mx-auto w-full max-w-[30rem] rounded-3xl border border-border bg-bg-panel px-5 py-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.22em] text-accent">Sync</p>
        <h1 className="mt-3 text-2xl font-semibold leading-tight">Sync from another device?</h1>
        <p className="mt-3 text-sm leading-6 text-accent">
          If you already use Foliole on another device, start here to pair and sync your data.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            className="rounded-2xl border border-border-strong bg-foreground px-4 py-3 text-sm font-medium text-bg-panel transition hover:opacity-90"
            onClick={() => void props.onStart()}
            type="button"
          >
            Sync from another device
          </button>
          <button
            className="rounded-2xl border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent"
            onClick={() => void props.onDismiss()}
            type="button"
          >
            Not now
          </button>
        </div>
      </section>
    </main>
  );
}
