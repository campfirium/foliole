import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';

import { CompanionShell } from './CompanionShell';
import { useCompanionBootstrap } from './useCompanionBootstrap';

function BootstrapStateCard(props: { detail: string; title: string; tone: 'default' | 'critical' }) {
  const toneClassName = props.tone === 'critical' ? 'border-error bg-error-subtle text-error-foreground' : 'border-border bg-bg-panel text-foreground';
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className={`w-full max-w-[32rem] rounded-2xl border px-6 py-6 shadow-panel ${toneClassName}`}>
        <p className="text-xs uppercase tracking-[0.22em] text-accent">Companion runtime</p>
        <h1 className="mt-4 text-2xl font-semibold leading-tight">{props.title}</h1>
        <p className="mt-3 text-sm leading-6">{props.detail}</p>
      </section>
    </main>
  );
}

export function CompanionApp() {
  const bootstrap = useCompanionBootstrap();

  const content = (() => {
    if (bootstrap.status === 'booting') {
      return (
        <BootstrapStateCard
          detail="Preparing a stable device identity and local companion storage before the article surface loads."
          title="Starting companion runtime"
          tone="default"
        />
      );
    }

    if (bootstrap.status === 'failed') {
      return <BootstrapStateCard detail={bootstrap.message} title="Companion bootstrap failed" tone="critical" />;
    }

    return <CompanionShell bootstrapState={bootstrap.state} />;
  })();

  return <MouseGestureSettingsProvider>{content}</MouseGestureSettingsProvider>;
}
