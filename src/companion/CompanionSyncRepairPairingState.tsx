import { useTranslation } from '../shared/localization/LocalizationProvider';

export function CompanionSyncRepairPairingState(props: { onRepair?: (() => Promise<unknown>) | undefined }) {
  const t = useTranslation();
  return (
    <div className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5">
      <h2 className="text-xl font-semibold leading-tight text-foreground">
        {t('companion.sync.repair.title')}
      </h2>
      <p className="mt-3 text-sm leading-6 text-accent">{t('companion.sync.repair.description')}</p>
      <button
        className="mt-5 min-h-11 w-full rounded-xl border border-companion-divider px-4 py-3 text-sm font-semibold text-foreground transition active:bg-companion-subtle/80"
        onClick={() => void props.onRepair?.()}
        type="button"
      >
        {t('companion.sync.repair.action')}
      </button>
    </div>
  );
}
