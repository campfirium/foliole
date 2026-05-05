import { useEffect, useState } from 'react';

type CompanionSyncPanelProps = {
  endpointUrl: string | null;
  error: string | null;
  lastSyncedAt: string | null;
  onClearError(): void;
  onPull(endpointUrl: string): Promise<unknown>;
  onSaveEndpoint(endpointUrl: string): Promise<unknown>;
  status: 'idle' | 'loading' | 'syncing';
};

const EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';

export function CompanionSyncPanel(props: CompanionSyncPanelProps) {
  const [endpointInput, setEndpointInput] = useState(props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT);

  useEffect(() => {
    setEndpointInput(props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT);
  }, [props.endpointUrl]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onClearError();
    await props.onSaveEndpoint(endpointInput);
    await props.onPull(endpointInput);
  }

  return (
    <section className="mb-8 rounded-3xl border border-border bg-bg-panel px-5 py-5 shadow-panel">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-accent">Desktop sync</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">Pull the current desktop snapshot</h2>
          <p className="mt-2 text-sm leading-6 text-accent">
            Emulator usually uses <code>10.0.2.2</code>. A real phone should use the Windows host LAN IP on the same network.
          </p>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
          <input
            className="min-w-0 flex-1 rounded-2xl border border-border bg-canvas px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
            onChange={(event) => setEndpointInput(event.target.value)}
            placeholder={EMULATOR_DEFAULT_ENDPOINT}
            value={endpointInput}
          />
          <button
            className="rounded-2xl border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground shadow-panel transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.status !== 'idle'}
            type="submit"
          >
            {props.status === 'syncing' ? 'Syncing...' : 'Pull from desktop'}
          </button>
        </form>
        <p className="text-xs text-accent">
          {props.lastSyncedAt ? `Last synced at ${props.lastSyncedAt}` : 'No desktop snapshot pulled yet.'}
        </p>
        {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
      </div>
    </section>
  );
}
