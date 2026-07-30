import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

import {
  MAX_COMPANION_CUSTOM_CSS_SNIPPETS,
  type CompanionCustomCssCollection,
  type CompanionCustomCssSnippet
} from './companionCustomCssModel';

interface SettingsSurfaceProps {
  actionError: string | null;
  collection: CompanionCustomCssCollection;
  isBusy: boolean;
  isInvalid: boolean;
  providerError: string | null;
  onAdd(): void;
  onEdit(snippet: CompanionCustomCssSnippet): void;
  onReset(): void;
  onToggle(snippet: CompanionCustomCssSnippet): void;
}

function CustomCssSettingsHeader(props: Pick<
  SettingsSurfaceProps,
  'collection' | 'isBusy' | 'isInvalid' | 'onAdd' | 'onReset'
>) {
  const t = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{t('companion.settings.appearance.css.title')}</h3>
        <p className="mt-2 text-sm leading-6 text-companion-text-secondary">
          {t('companion.settings.appearance.css.description')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {props.isInvalid || props.collection.snippets.length > 0 ? (
          <AppButton disabled={props.isBusy} onClick={props.onReset} variant="danger">
            {t('companion.settings.appearance.css.reset')}
          </AppButton>
        ) : null}
        <AppButton
          disabled={props.isBusy
            || props.isInvalid
            || props.collection.snippets.length >= MAX_COMPANION_CUSTOM_CSS_SNIPPETS}
          onClick={props.onAdd}
          variant="emphasis"
        >
          {t('companion.settings.appearance.css.add')}
        </AppButton>
      </div>
    </div>
  );
}

function CustomCssSettingsIssue(props: Pick<SettingsSurfaceProps, 'actionError' | 'providerError'>) {
  if (!props.actionError && !props.providerError) return null;
  return (
    <div className="mt-4 rounded-lg border border-error/35 p-3 text-sm leading-6 text-error" role="alert">
      <p>{props.actionError ?? props.providerError}</p>
    </div>
  );
}

function CustomCssSnippetList(props: Pick<SettingsSurfaceProps, 'collection' | 'isBusy' | 'onEdit' | 'onToggle'>) {
  const t = useTranslation();
  if (props.collection.snippets.length === 0) {
    return <p className="mt-5 text-sm text-companion-text-secondary">{t('companion.settings.appearance.css.empty')}</p>;
  }
  return (
    <ul className="mt-5 divide-y divide-companion-divider border-y border-companion-divider">
      {props.collection.snippets.map((snippet) => (
        <li className="flex items-center justify-between gap-3 py-3" key={snippet.id}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{snippet.name}</p>
            <p className="mt-1 text-xs text-companion-text-secondary">
              {t(snippet.enabled ? 'companion.settings.appearance.css.on' : 'companion.settings.appearance.css.off')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AppButton aria-checked={snippet.enabled} disabled={props.isBusy} onClick={() => props.onToggle(snippet)} role="switch">
              {t(snippet.enabled ? 'companion.settings.appearance.css.disable' : 'companion.settings.appearance.css.enable')}
            </AppButton>
            <AppButton onClick={() => props.onEdit(snippet)}>{t('companion.settings.appearance.css.edit')}</AppButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CompanionCustomCssSettingsSurface(props: SettingsSurfaceProps) {
  return (
    <section className="px-5 py-5">
      <div className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5">
        <CustomCssSettingsHeader {...props} />
        <CustomCssSettingsIssue {...props} />
        <CustomCssSnippetList {...props} />
      </div>
    </section>
  );
}
