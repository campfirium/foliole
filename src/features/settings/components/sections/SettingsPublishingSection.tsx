import { useEffect, useState } from 'react';

import { definedProps } from '../../../../shared/lib/definedProps';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDiscoursePublishSettingsFromRuntime,
  saveDiscoursePublishSettingsToRuntime
} from '../../../../shared/platform/discoursePublishRepository';
import {
  AppErrorState,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';

interface PublishingFormState {
  apiKey: string;
  siteUrl: string;
}

const EMPTY_FORM: PublishingFormState = {
  apiKey: '',
  siteUrl: ''
};

function usePublishingForm() {
  const t = useTranslation();
  const [form, setForm] = useState<PublishingFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  useEffect(() => {
    void loadDiscoursePublishSettingsFromRuntime()
      .then((settings) => {
        if (settings) {
          setForm({
            apiKey: '',
            siteUrl: settings.site_url
          });
          setHasApiKey(settings.has_api_key);
        }
        setStatus('idle');
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : t('settings.publishing.error.load'));
        setStatus('idle');
      });
  }, [t]);
  return { error, form, hasApiKey, setError, setForm, setHasApiKey, setStatus, status };
}

function PublishingTextRow(props: {
  description: string;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  title: string;
  type?: 'password' | 'text';
  value: string;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className="w-[min(520px,100%)]">
        <input
          aria-label={props.label}
          className={settingsFieldClassName()}
          onBlur={props.onBlur}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') props.onEnter?.();
          }}
          placeholder={props.placeholder}
          type={props.type ?? 'text'}
          value={props.value}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function PublishingRows(props: {
  form: PublishingFormState;
  hasApiKey: boolean;
  saveApiKey: () => void;
  updateForumAddress: (siteUrl: string) => void;
  updateForm: (patch: Partial<PublishingFormState>) => void;
}) {
  const t = useTranslation();
  return (
    <>
      <PublishingTextRow description={t('settings.publishing.site.description')} label={t('settings.publishing.site.aria')} onChange={props.updateForumAddress} title={t('settings.publishing.site.title')} value={props.form.siteUrl} />
      <PublishingTextRow
        description={props.hasApiKey ? t('settings.publishing.apiKey.saved') : t('settings.publishing.apiKey.description')}
        label={t('settings.publishing.apiKey.aria')}
        onBlur={props.saveApiKey}
        onChange={(apiKey) => props.updateForm({ apiKey })}
        onEnter={props.saveApiKey}
        {...(props.hasApiKey && props.form.apiKey === '' ? { placeholder: '****************' } : {})}
        title={t('settings.publishing.apiKey.title')}
        type="password"
        value={props.form.apiKey}
      />
    </>
  );
}

export function SettingsPublishingSection() {
  const t = useTranslation();
  const state = usePublishingForm();
  const updateForm = (patch: Partial<PublishingFormState>) => state.setForm((current) => ({ ...current, ...patch }));
  const save = async (form: PublishingFormState, includeApiKey: boolean) => {
    state.setStatus('saving');
    state.setError(null);
    try {
      const saved = await saveDiscoursePublishSettingsToRuntime({
        ...definedProps({ api_key: includeApiKey ? form.apiKey || undefined : undefined }),
        site_url: form.siteUrl
      });
      state.setHasApiKey(Boolean(saved?.has_api_key));
      if (includeApiKey) updateForm({ apiKey: '' });
    } catch (saveError) {
      state.setError(saveError instanceof Error ? saveError.message : t('settings.publishing.error.save'));
    } finally {
      state.setStatus('idle');
    }
  };
  const updateForumAddress = (siteUrl: string) => {
    const nextForm = { ...state.form, siteUrl };
    state.setForm(nextForm);
    void save(nextForm, false);
  };
  const saveApiKey = () => {
    if (!state.form.apiKey.trim()) return;
    void save(state.form, true);
  };
  return (
    <SettingsSection ariaLabel={t('settings.publishing.sectionAria')} title={t('settings.publishing.title')}>
      {state.error ? <AppErrorState description={state.error} title={t('settings.publishing.error.title')} /> : null}
      <PublishingRows form={state.form} hasApiKey={state.hasApiKey} saveApiKey={saveApiKey} updateForm={updateForm} updateForumAddress={updateForumAddress} />
    </SettingsSection>
  );
}
