import { useEffect, useMemo, useState } from 'react';

import {
  buildCustomCopyExport,
  getCustomCopyOverrides,
  setCustomCopyOverride
} from '../../../shared/localization/customCopyOverrides';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';
import { listOfficialTranslations } from '../../../shared/localization/translations';
import { onWindowPriorityEscape } from '../../../shared/platform/keyboard';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';
import { subscribeCustomCopyDialogOpen } from '../model/customCopyDialogRequests';

import { CustomCopyDialogSurface } from './CustomCopyDialogSurface';

const MAX_VISIBLE_ENTRIES = 160;

function downloadOverrides(locale: Parameters<typeof buildCustomCopyExport>[0]) {
  const payload = JSON.stringify(buildCustomCopyExport(locale), null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `foliole-custom-copy.${locale}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function CustomCopyDialogHost() {
  const { locale, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacedOnly, setReplacedOnly] = useState(false);
  const overrides = getCustomCopyOverrides(locale);
  const entries = useMemo(() => listOfficialTranslations(locale), [locale, t]);
  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return entries.filter((item) => {
      if (replacedOnly && !overrides[item.key]) return false;
      if (!normalizedQuery) return true;
      return [item.key, item.value, overrides[item.key] ?? '']
        .some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery));
    }).slice(0, MAX_VISIBLE_ENTRIES);
  }, [entries, locale, overrides, query, replacedOnly]);

  useEffect(() => subscribeCustomCopyDialogOpen(() => setOpen(true)), []);
  useEffect(() => {
    if (!open) return undefined;
    return onWindowPriorityEscape(() => {
      setOpen(false);
      return true;
    });
  }, [open]);

  return (
    <CustomCopyDialogSurface
      items={visibleEntries}
      onChange={(key, value) => setCustomCopyOverride(locale, key, value)}
      onExport={() => {
        downloadOverrides(locale);
        showAppRuntimeNotice(t('settings.customCopy.exported'), 'success');
      }}
      onOpenChange={setOpen}
      onQueryChange={setQuery}
      onReplacedOnlyChange={setReplacedOnly}
      open={open}
      overrides={overrides}
      query={query}
      replacedOnly={replacedOnly}
      t={t}
    />
  );
}
