import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppInput, SettingsRow, SettingsSection } from '../../shared/ui';

import { useReadwiseManualSearch } from './useReadwiseManualSearch';

export function ReadwiseManualImportSection() {
  const t = useTranslation();
  const search = useReadwiseManualSearch();
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.manual.title')} title={t('desktop.readwise.manual.title')}>
      <form onSubmit={(event) => { event.preventDefault(); if (search.ready) void search.search(); }}>
        <AppInput
          aria-label={t('desktop.readwise.manual.query')}
          disabled={!search.ready || Boolean(search.pending)}
          onChange={(event) => search.changeQuery(event.target.value)}
          placeholder={t(search.ready ? 'desktop.readwise.manual.query' : 'desktop.readwise.manual.preparing')}
          type="search"
          value={search.query}
        />
      </form>
      {search.error ? <p role="alert">{t('desktop.readwise.manual.failed')}</p> : null}
      {search.searched && search.sources.length === 0 ? <p>{t('desktop.readwise.manual.empty')}</p> : null}
      {search.sources.map((source) => (
        <SettingsRow key={source.id} title={source.title} description={source.author ?? undefined}>
          <AppButton
            disabled={Boolean(search.pending) || source.status === 'imported' || source.status === 'suppressed'}
            onClick={() => void search.adopt(source)}
            size="sm"
            variant="default"
          >
            {t(source.status === 'imported' ? 'desktop.readwise.manual.imported'
              : source.status === 'suppressed' ? 'desktop.readwise.manual.suppressed'
                : source.status === 'deleted' ? 'desktop.readwise.manual.reimport' : 'desktop.readwise.manual.import')}
          </AppButton>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
