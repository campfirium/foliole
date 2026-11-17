import { useId } from 'react';

import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsSegmentedControl } from '../../../shared/ui';

const choices = [
  ['topic-info', 'desktop.superMemoDrafts.sourceTopicInfo'],
  ['content-end', 'desktop.superMemoDrafts.sourceContentEnd']
] as const;

export function SuperMemoSourceSettings({ value, onChange, disabled, compact = false }: {
  value: SuperMemoSourceFormat; onChange(next: SuperMemoSourceFormat): void; disabled: boolean; compact?: boolean;
}) {
  const t = useTranslation();
  const group = useId();
  if (compact) {
    return (
      <section className="min-w-0 text-sm">
        <h3 className="mb-2 flex min-h-8 items-center font-semibold">{t('desktop.superMemoDrafts.sourceInformation')}</h3>
        <SettingsSegmentedControl ariaLabel={t('desktop.superMemoDrafts.sourceInformation')} disabled={disabled}
          className="h-auto min-h-9 w-full max-w-sm [&>button]:h-auto [&>button]:min-h-8 [&>button]:min-w-0 [&>button]:flex-1 [&>button>span]:whitespace-normal"
          value={value.placement} options={choices.map(([placement, label]) => ({ value: placement, label: t(label) }))}
          onChange={next => {
            const choice = choices.find(([placement]) => placement === next);
            if (choice) onChange({ ...value, placement: choice[0] });
          }} />
        <div className="mt-3"><SourceExample compact placement={value.placement} /></div>
      </section>
    );
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 text-sm">
      <legend className="mb-2 font-medium">{t('desktop.superMemoDrafts.sourceInformation')}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map(([placement, label]) => (
          <label key={placement} className="cursor-pointer rounded-lg border border-foreground/15 p-3 hover:bg-foreground/5 has-[:checked]:border-[var(--role-accent)] has-[:checked]:bg-[rgb(var(--role-accent-rgb)/0.08)]">
            <span className="flex items-center gap-2 font-medium">
              <input type="radio" name={group} checked={value.placement === placement}
                aria-label={t(label)} className="accent-[var(--role-accent)]"
                onChange={() => onChange({ ...value, placement })} />
              {t(label)}
            </span>
            <SourceExample placement={placement} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SourceExample({ placement, compact = false }: Pick<SuperMemoSourceFormat, 'placement'> & { compact?: boolean }) {
  const t = useTranslation();
  return (
    <span className={compact ? "block space-y-1 text-xs leading-5 text-foreground/70"
      : "mt-3 block space-y-2 rounded-md border border-foreground/10 bg-canvas p-3 text-xs leading-5"}>
      <strong className="block">{t(placement === 'topic-info'
        ? 'desktop.superMemoDrafts.exampleTopic' : 'desktop.superMemoDrafts.exampleItem')}</strong>
      {placement === 'topic-info' ? (
        <><span className="block border-b border-foreground/10 pb-1 text-foreground/65">
          {t('desktop.superMemoDrafts.exampleCitation')}
        </span><span className="block">{t('desktop.superMemoDrafts.exampleArticle')}</span></>
      ) : (
        <><span className="block">{t('desktop.superMemoDrafts.exampleQuestion')}</span>
          <span className="block text-foreground/65">{t('desktop.superMemoDrafts.exampleCitation')}</span>
          <span className="block border-t border-foreground/10 pt-2">{t('desktop.superMemoDrafts.exampleAnswer')}</span></>
      )}
    </span>
  );
}
