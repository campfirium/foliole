import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { changeArticleTarget, refreshArticleTargets, useArticleTargets } from '../../../../shared/platform/runtime/articleTargets';
import { settingsFieldClassName } from '../../../../shared/ui';
import { showAppRuntimeNotice } from '../../../../shared/ui/AppRuntimeNotice';

export function ArticleTargetSelect() {
  const t = useTranslation();
  const { selected, available } = useArticleTargets();
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refreshArticleTargets(); }, []);

  const selectTarget = async (id: string) => {
    setBusy(true);
    try {
      await changeArticleTarget(id);
    } catch {
      showAppRuntimeNotice(t('desktop.command.sendToEdgeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return <select
    aria-label={t('settings.webLookup.articleTarget')}
    className={settingsFieldClassName()}
    disabled={busy}
    onChange={(event) => { void selectTarget(event.target.value); }}
    value={selected?.id ?? ''}
  >
    {!selected ? <option disabled value="">{t('settings.webLookup.chooseArticleTarget')}</option> : null}
    {selected && !available.some(({ id }) => id === selected.id) ? <option disabled value={selected.id}>{selected.name}</option> : null}
    {available.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    <option value="pick">{t('settings.webLookup.pickArticleTarget')}</option>
  </select>;
}
