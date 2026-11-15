import { useState } from 'react';

import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';

export function SuperMemoSourceSettings({ value, onChange, disabled, example }: {
  value: SuperMemoSourceFormat; onChange(next: SuperMemoSourceFormat): void; disabled: boolean; example?: string | undefined;
}) {
  const t = useTranslation();
  const [template, setTemplate] = useState(value.template);
  return (
    <details className="max-h-56 shrink-0 overflow-auto text-sm">
      <summary>{t('desktop.superMemoDrafts.sourceInformation')}</summary>
      <fieldset disabled={disabled} className="grid gap-2 py-2">
        <select aria-label={t('desktop.superMemoDrafts.sourceInformation')} value={value.placement}
          onChange={event => onChange({ ...value, placement: event.target.value === 'body' ? 'body' : 'metadata' })}>
          <option value="metadata">{t('desktop.superMemoDrafts.sourceMetadata')}</option>
          <option value="body">{t('desktop.superMemoDrafts.sourceBody')}</option>
        </select>
        {value.placement === 'body' ? <>
          <textarea aria-label={t('desktop.superMemoDrafts.sourceTemplate')} maxLength={4000} rows={3}
            value={template} onChange={event => setTemplate(event.target.value)} />
          <code>{'{articleLink} {title} {author} {url} {date} {publisher} {comment}'}</code>
          <AppButton type="button" onClick={() => onChange({ ...value, template })}>
            {t('desktop.superMemoDrafts.applySourceTemplate')}
          </AppButton>
        </> : null}
        {example ? <pre className="whitespace-pre-wrap" aria-label={t('desktop.superMemoDrafts.sourceExample')}>{example}</pre> : null}
      </fieldset>
    </details>
  );
}
