const COMPANION_SURFACES = [
  {
    description: 'Shared renderer shell for Android and future iOS companion targets.',
    title: 'Companion shell'
  },
  {
    description: 'Capacitor Android host syncs this build into native preview and device runs.',
    title: 'Native bridge target'
  },
  {
    description: 'Desktop workspace remains in Electron, so Android preview no longer opens Windows by default.',
    title: 'Split preview flow'
  }
];

function resolveRuntimeSummary() {
  if (typeof navigator === 'undefined') {
    return 'Unknown runtime';
  }
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('android')) {
    return 'Android WebView runtime';
  }
  if (userAgent.includes('electron')) {
    return 'Electron runtime';
  }
  return 'Browser preview runtime';
}

export function CompanionApp() {
  const runtimeSummary = resolveRuntimeSummary();

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <section className="flex min-h-screen w-full flex-col bg-background">
        <header className="border-b border-border bg-bg-subtle px-6 py-4 sm:px-8">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Foliole companion</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Android preview shell is now isolated.</h1>
              <p className="mt-2 max-w-xl text-sm text-accent">
                This entry is the native companion surface for Capacitor targets. Desktop workspace stays on the Electron
                path, while Android preview consumes this dedicated shell.
              </p>
            </div>
            <div className="inline-flex items-center rounded-md border border-border bg-canvas px-3 py-2 text-sm text-accent shadow-panel">
              Runtime: {runtimeSummary}
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-4 px-6 py-6 sm:px-8 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-canvas p-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Preview contract</p>
            <h2 className="mt-3 text-lg font-semibold text-foreground">What `android:preview` does now</h2>
            <div className="mt-4 space-y-3">
              {COMPANION_SURFACES.map((surface) => (
                <section className="rounded-lg border border-border bg-bg-panel p-4" key={surface.title}>
                  <h3 className="text-sm font-semibold text-foreground">{surface.title}</h3>
                  <p className="mt-1 text-sm text-accent">{surface.description}</p>
                </section>
              ))}
            </div>
          </article>

          <aside className="rounded-xl border border-border bg-bg-panel p-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Dev loop</p>
            <h2 className="mt-3 text-lg font-semibold text-foreground">Recommended commands</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-mono text-foreground">npm run android:web:dev</dt>
                <dd className="mt-1 text-accent">Fast browser loop for the companion shell only.</dd>
              </div>
              <div>
                <dt className="font-mono text-foreground">npm run android:preview</dt>
                <dd className="mt-1 text-accent">Windows mirror sync, companion build, Capacitor sync, then open Android Studio or emulator.</dd>
              </div>
              <div>
                <dt className="font-mono text-foreground">npm run android:logcat</dt>
                <dd className="mt-1 text-accent">Native runtime logs when debugging bridge or WebView issues.</dd>
              </div>
            </dl>
          </aside>
        </section>
      </section>
    </main>
  );
}
