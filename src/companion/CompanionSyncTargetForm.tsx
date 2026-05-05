import { useEffect, useState } from 'react';

import { CompanionSyncRememberedTargetList } from './CompanionSyncRememberedTargetList';

type CompanionSyncTargetFormProps = {
  currentEndpointUrl: string | null;
  endpointInput: string;
  isPaired: boolean;
  onChange(value: string): void;
  onRemoveRememberedTarget(value: string): void;
  rememberedTargets: string[];
  onSelectRememberedTarget(value: string): void;
  onSubmit(event: React.FormEvent<HTMLFormElement>): void;
  status: 'idle' | 'loading' | 'syncing';
};

const EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';

function ManualEntryToggle(props: {
  isManualEntryVisible: boolean;
  onToggle(): void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-accent">
      <p>Saved devices stay here, so this device can reconnect quietly later.</p>
      <button
        className="rounded-2xl border border-border bg-canvas px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent"
        onClick={props.onToggle}
        type="button"
      >
        {props.isManualEntryVisible ? 'Hide manual address' : 'Enter address manually'}
      </button>
    </div>
  );
}

function ManualEntryForm(props: Pick<
  CompanionSyncTargetFormProps,
  'endpointInput' | 'isPaired' | 'onChange' | 'onSubmit' | 'status'
>) {
  return (
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={props.onSubmit}>
      <input
        className="min-w-0 flex-1 rounded-2xl border border-border bg-canvas px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={EMULATOR_DEFAULT_ENDPOINT}
        value={props.endpointInput}
      />
      <button
        className="rounded-2xl border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground shadow-panel transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.status !== 'idle' || !props.isPaired}
        type="submit"
      >
        {props.status === 'syncing' ? 'Syncing...' : 'Sync now'}
      </button>
    </form>
  );
}

export function CompanionSyncTargetForm(props: CompanionSyncTargetFormProps) {
  const [isManualEntryVisible, setIsManualEntryVisible] = useState(props.rememberedTargets.length === 0);

  useEffect(() => {
    if (props.rememberedTargets.length === 0) {
      setIsManualEntryVisible(true);
    }
  }, [props.rememberedTargets]);

  return (
    <div className="flex flex-col gap-3">
      {props.rememberedTargets.length > 0 ? (
        <>
          <CompanionSyncRememberedTargetList
            currentEndpointUrl={props.currentEndpointUrl}
            onRemove={props.onRemoveRememberedTarget}
            onSelect={props.onSelectRememberedTarget}
            rememberedTargets={props.rememberedTargets}
          />
          <ManualEntryToggle
            isManualEntryVisible={isManualEntryVisible}
            onToggle={() => setIsManualEntryVisible((current) => !current)}
          />
        </>
      ) : null}
      {isManualEntryVisible ? <ManualEntryForm {...props} /> : null}
    </div>
  );
}
