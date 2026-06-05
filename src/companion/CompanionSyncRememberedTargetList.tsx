import { useTranslation } from '../shared/localization/LocalizationProvider';

type CompanionSyncRememberedTargetListProps = {
  currentEndpointUrl: string | null;
  onRemove(target: string): void;
  onSelect(target: string): void;
  rememberedTargets: string[];
};

function RememberedTargetRow(props: {
  isCurrent: boolean;
  onRemove(): void;
  onSelect(): void;
  target: string;
}) {
  const t = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-canvas px-3 py-2">
      <button
        aria-pressed={props.isCurrent}
        className="min-w-0 flex-1 text-left text-xs text-foreground transition hover:text-accent-strong"
        onClick={props.onSelect}
        type="button"
      >
        <span className="block truncate">{props.target}</span>
      </button>
      {props.isCurrent ? (
        <span className="rounded-full border border-border bg-bg-subtle px-2 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
          {t('companion.sync.remembered.current')}
        </span>
      ) : null}
      <button
        aria-label={t('companion.sync.remembered.forgetTarget', { target: props.target })}
        className="rounded-full border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-accent transition hover:border-accent hover:text-foreground"
        onClick={props.onRemove}
        type="button"
      >
        {t('companion.sync.remembered.forget')}
      </button>
    </div>
  );
}

export function CompanionSyncRememberedTargetList(props: CompanionSyncRememberedTargetListProps) {
  return (
    <div className="flex flex-col gap-2">
      {props.rememberedTargets.map((target) => (
        <RememberedTargetRow
          isCurrent={target === props.currentEndpointUrl}
          key={target}
          onRemove={() => props.onRemove(target)}
          onSelect={() => props.onSelect(target)}
          target={target}
        />
      ))}
    </div>
  );
}
