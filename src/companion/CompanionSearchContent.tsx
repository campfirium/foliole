import { useState } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState, appInputBorderFocusVisibleClassName } from '../shared/ui';

export function CompanionSearchContent() {
  const t = useTranslation();
  const [query, setQuery] = useState('');

  return (
    <section className="px-1 py-4">
      <label className="block">
        <span className="sr-only">{t('companion.search.label')}</span>
        <input
          className={cn(
            'h-12 w-full rounded-md border border-companion-divider bg-companion-content px-4 text-base text-foreground transition placeholder:text-companion-text-secondary',
            appInputBorderFocusVisibleClassName
          )}
          disabled
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('companion.search.placeholder')}
          type="search"
          value={query}
        />
      </label>
      <div className="mt-6 border-t border-companion-divider py-5">
        <AppEmptyState
          className="min-h-0 items-start py-1 text-left text-companion-text-secondary"
          description={t('companion.search.description')}
          title={t('companion.search.title')}
        />
      </div>
    </section>
  );
}
