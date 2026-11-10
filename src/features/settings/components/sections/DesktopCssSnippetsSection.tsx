import { FolderOpen, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openCssSnippetFolder } from '../../../../shared/platform/desktop/cssSnippetFiles';
import {
  SettingsRow,
  SettingsSection,
  settingsHotkeySearchFieldClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';
import { useDesktopCustomCss } from '../../context/DesktopCustomCssProvider';
import { SETTINGS_CUSTOM_CSS_ROW_ID } from '../../model/settingsSearchRowCatalog';

type Snippets = NonNullable<ReturnType<typeof useDesktopCustomCss>>;

function CssSnippetList({ snippets, query }: { snippets: Snippets; query: string }) {
  const t = useTranslation();
  const files = snippets.files.filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()));
  if (!files.length) {
    return <SettingsRow description={t('companion.settings.appearance.css.noMatches')} />;
  }
  return files.map(({ name, valid, enabled }) => (
    <SettingsRow
      controlLayout="inline"
      description={valid ? undefined : t('companion.settings.appearance.css.globalValidationError')}
      key={name}
      title={name.replace(/\.css$/i, '')}
    >
      <button
        aria-checked={enabled}
        aria-label={name}
        className={settingsSwitchClassName(enabled)}
        disabled={snippets.busy || (!valid && !enabled)}
        onClick={() => snippets.toggle(name)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
      </button>
    </SettingsRow>
  ));
}

export function DesktopCssSnippetsSection() {
  const t = useTranslation();
  const snippets = useDesktopCustomCss();
  const [query, setQuery] = useState('');
  const [openError, setOpenError] = useState(false);
  if (!snippets) return null;

  async function openFolder() {
    setOpenError(false);
    try {
      await openCssSnippetFolder();
    } catch {
      setOpenError(true);
    }
  }

  const refreshLabel = t('companion.settings.appearance.css.reload');
  const folderLabel = t('companion.settings.appearance.css.openFolder');
  const searchLabel = t('companion.settings.appearance.css.search');
  const title = t('companion.settings.appearance.css.title');
  return (
    <SettingsSection
      actions={<div className="flex items-center gap-1">
        <button aria-label={refreshLabel} className={settingsUtilityIconButtonClassName()} title={refreshLabel}
          disabled={snippets.busy} onClick={() => { setOpenError(false); void snippets.refresh(); }} type="button">
          <RefreshCw aria-hidden="true" size={16} />
        </button>
        <button aria-label={folderLabel} className={settingsUtilityIconButtonClassName()} title={folderLabel}
          onClick={() => void openFolder()} type="button">
          <FolderOpen aria-hidden="true" size={16} />
        </button>
      </div>}
      ariaLabel={title}
      searchRowId={SETTINGS_CUSTOM_CSS_ROW_ID}
      title={title}
    >
      {(openError || snippets.error) && <p className="px-settings-panel-x py-2 text-ui-md text-error" role="alert">{t('companion.settings.appearance.css.fileError')}</p>}
      {snippets.files.length > 0 && (
        <>
          <SettingsRow aria-busy={snippets.busy}>
            <div className="relative w-full">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label={searchLabel} className={settingsHotkeySearchFieldClassName()}
                placeholder={searchLabel} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            </div>
          </SettingsRow>
          <CssSnippetList query={query} snippets={snippets} />
        </>
      )}
    </SettingsSection>
  );
}
