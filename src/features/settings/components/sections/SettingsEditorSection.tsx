import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppInput,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsResetButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { FRONTMATTER_META_FIELDS_DEFAULT } from '../../../editor/model/frontmatterMetaFieldsSetting';
import {
  DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX,
  getHighlightAnnotationPrefix,
  setHighlightAnnotationPrefix
} from '../../../editor/model/highlightAnnotationPrefixSetting';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { createSettingsSearchRows } from '../../model/settingsSearchRowCatalog';

import { SelectionToolbarSettingsRow } from './SelectionToolbarSettingsRow';
import {
  ClozeFrontLengthLimitRow,
  ClozeSelectedTextLimitRow,
  LongClozeFrontGuardRow
} from './SettingsEditorClozeRows';

function useEditorSettingsRow(id: string) {
  const t = useTranslation();
  const row = createSettingsSearchRows(t).find((item) => item.id === id);
  if (!row) throw new Error(`Missing editor settings search row: ${id}`);
  return row;
}

function HighlightAnnotationPrefixRow() {
  const t = useTranslation();
  const row = useEditorSettingsRow('editor-highlight-annotation-prefix');
  const [prefix, setPrefix] = useState(() => getHighlightAnnotationPrefix());
  const updatePrefix = (value: string) => {
    setPrefix(setHighlightAnnotationPrefix(value));
  };

  return (
    <SettingsRow
      {...settingsSearchRowProps(row)}
      description={row.description}
      title={row.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label={t('settings.editor.highlightPrefix.reset')}
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={prefix === DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}
            onClick={() => updatePrefix(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label={row.title}
            className={SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME}
            maxLength={24}
            onChange={(event) => updatePrefix(event.target.value)}
            value={prefix}
          />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function FrontmatterMetaFieldsRow() {
  const t = useTranslation();
  const row = useEditorSettingsRow('editor-frontmatter-meta');
  const {
    frontmatterMetaFields,
    resetFrontmatterMetaFields,
    setFrontmatterMetaFields
  } = useAppearanceSettings();

  return (
    <SettingsRow
      {...settingsSearchRowProps(row)}
      description={t('settings.editor.frontmatter.description')}
      title={row.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label={t('settings.editor.frontmatter.reset')}
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={frontmatterMetaFields === FRONTMATTER_META_FIELDS_DEFAULT}
            onClick={resetFrontmatterMetaFields}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label={t('settings.editor.frontmatter.aria')}
            className="h-9 w-[22rem]"
            onChange={(event) => setFrontmatterMetaFields(event.target.value)}
            value={frontmatterMetaFields}
          />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function EditorLiveMarkdownSection() {
  const t = useTranslation();
  const saveRemoteImagesRow = useEditorSettingsRow('editor-save-remote-images-locally');
  const {
    autoLocalizeRemoteImages,
    setAutoLocalizeRemoteImages,
  } = useAppearanceSettings();

  return (
    <SettingsSection ariaLabel={t('settings.editor.liveMarkdown.aria')} title={t('settings.editor.liveMarkdown.section')}>
      <SettingsRow {...settingsSearchRowProps(saveRemoteImagesRow)} description={saveRemoteImagesRow.description} title={saveRemoteImagesRow.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button aria-checked={autoLocalizeRemoteImages} aria-label={saveRemoteImagesRow.title} className={settingsSwitchClassName(autoLocalizeRemoteImages)} onClick={() => setAutoLocalizeRemoteImages(!autoLocalizeRemoteImages)} role="switch" type="button">
            <span aria-hidden="true" className={settingsSwitchKnobClassName(autoLocalizeRemoteImages)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      <SelectionToolbarSettingsRow />
      <FrontmatterMetaFieldsRow />
    </SettingsSection>
  );
}

function ImmersiveReadingSection() {
  const row = useEditorSettingsRow('editor-immersive-double-click-edit');
  const { immersiveDoubleClickEditEnabled, setImmersiveDoubleClickEditEnabled } = useAppearanceSettings();
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.editor.readingMode.aria')} title={t('settings.editor.readingMode.section')}>
      <SettingsRow {...settingsSearchRowProps(row)} description={row.description} title={row.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-checked={immersiveDoubleClickEditEnabled}
            aria-label={row.title}
            className={settingsSwitchClassName(immersiveDoubleClickEditEnabled)}
            onClick={() => setImmersiveDoubleClickEditEnabled(!immersiveDoubleClickEditEnabled)}
            role="switch"
            type="button"
          >
            <span aria-hidden="true" className={settingsSwitchKnobClassName(immersiveDoubleClickEditEnabled)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsEditorSection() {
  const t = useTranslation();
  return (
    <>
      <EditorLiveMarkdownSection />
      <SettingsSection ariaLabel={t('settings.editor.clozeGuard.aria')} title={t('settings.editor.clozeGuard.section')}>
        <LongClozeFrontGuardRow />
        <ClozeSelectedTextLimitRow />
        <ClozeFrontLengthLimitRow />
      </SettingsSection>
      <SettingsSection ariaLabel={t('settings.editor.annotation.aria')} title={t('settings.editor.annotation.section')}>
        <HighlightAnnotationPrefixRow />
      </SettingsSection>
      <ImmersiveReadingSection />
    </>
  );
}
