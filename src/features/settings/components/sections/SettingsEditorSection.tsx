import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

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
import { EDITOR_SETTINGS_SEARCH_ROWS } from '../../model/settingsSearchRowCatalog';

import { SelectionToolbarSettingsRow } from './SelectionToolbarSettingsRow';
import {
  ClozeFrontLengthLimitRow,
  ClozeSelectedTextLimitRow,
  LongClozeFrontGuardRow
} from './SettingsEditorClozeRows';

function getEditorSettingsRow(id: string) {
  const row = EDITOR_SETTINGS_SEARCH_ROWS.find((item) => item.id === id);
  if (!row) throw new Error(`Missing editor settings search row: ${id}`);
  return row;
}

const EDITOR_ROW = {
  frontmatterMeta: getEditorSettingsRow('editor-frontmatter-meta'),
  highlightAnnotationPrefix: getEditorSettingsRow('editor-highlight-annotation-prefix'),
  saveRemoteImages: getEditorSettingsRow('editor-save-remote-images-locally')
};

function HighlightAnnotationPrefixRow() {
  const [prefix, setPrefix] = useState(() => getHighlightAnnotationPrefix());
  const updatePrefix = (value: string) => {
    setPrefix(setHighlightAnnotationPrefix(value));
  };

  return (
    <SettingsRow
      {...settingsSearchRowProps(EDITOR_ROW.highlightAnnotationPrefix)}
      description={EDITOR_ROW.highlightAnnotationPrefix.description}
      title={EDITOR_ROW.highlightAnnotationPrefix.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label="Reset highlight annotation prefix"
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={prefix === DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}
            onClick={() => updatePrefix(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label="Highlight annotation prefix"
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
  const {
    frontmatterMetaFields,
    resetFrontmatterMetaFields,
    setFrontmatterMetaFields
  } = useAppearanceSettings();

  return (
    <SettingsRow
      {...settingsSearchRowProps(EDITOR_ROW.frontmatterMeta)}
      description="Fields shown under the title. Use commas for groups and | for aliases, such as author|byline, url|link|source."
      title={EDITOR_ROW.frontmatterMeta.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label="Reset frontmatter meta fields"
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={frontmatterMetaFields === FRONTMATTER_META_FIELDS_DEFAULT}
            onClick={resetFrontmatterMetaFields}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label="Frontmatter meta fields"
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
  const {
    autoLocalizeRemoteImages,
    setAutoLocalizeRemoteImages,
  } = useAppearanceSettings();

  return (
    <SettingsSection ariaLabel="Editor settings section" title="Live markdown">
      <SettingsRow {...settingsSearchRowProps(EDITOR_ROW.saveRemoteImages)} description={EDITOR_ROW.saveRemoteImages.description} title={EDITOR_ROW.saveRemoteImages.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button aria-checked={autoLocalizeRemoteImages} aria-label="Save remote images locally" className={settingsSwitchClassName(autoLocalizeRemoteImages)} onClick={() => setAutoLocalizeRemoteImages(!autoLocalizeRemoteImages)} role="switch" type="button">
            <span aria-hidden="true" className={settingsSwitchKnobClassName(autoLocalizeRemoteImages)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      <SelectionToolbarSettingsRow />
      <FrontmatterMetaFieldsRow />
    </SettingsSection>
  );
}

export function SettingsEditorSection() {
  return (
    <>
      <EditorLiveMarkdownSection />
      <SettingsSection ariaLabel="Cloze guard settings section" title="Cloze guard">
        <LongClozeFrontGuardRow />
        <ClozeSelectedTextLimitRow />
        <ClozeFrontLengthLimitRow />
      </SettingsSection>
      <SettingsSection ariaLabel="Annotation settings section" title="Annotations">
        <HighlightAnnotationPrefixRow />
      </SettingsSection>
    </>
  );
}
