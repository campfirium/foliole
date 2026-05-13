import { useState } from 'react';

import { getEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { getFrontmatterDisplayMode } from '../../editor/model/frontmatterDisplayModeSetting';
import { getFrontmatterMetaFields } from '../../editor/model/frontmatterMetaFieldsSetting';
import { getMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { shouldAutoLocalizeRemoteImages as getAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';

export function useEditorSettingsStateValues() {
  const [autoLocalizeRemoteImagesState, setAutoLocalizeRemoteImagesState] = useState(() => getAutoLocalizeRemoteImages());
  const [frontmatterDisplayModeState, setFrontmatterDisplayModeState] = useState(() => getFrontmatterDisplayMode());
  const [frontmatterMetaFieldsState, setFrontmatterMetaFieldsState] = useState(() => getFrontmatterMetaFields());
  const [markdownSyntaxVisibilityState, setMarkdownSyntaxVisibilityState] = useState(() => getMarkdownSyntaxVisibility());
  const [editorDisplayModeState, setEditorDisplayModeState] = useState(() => getEditorDisplayMode());

  return {
    autoLocalizeRemoteImagesState,
    editorDisplayModeState,
    frontmatterDisplayModeState,
    frontmatterMetaFieldsState,
    markdownSyntaxVisibilityState,
    setAutoLocalizeRemoteImagesState,
    setEditorDisplayModeState,
    setFrontmatterDisplayModeState,
    setFrontmatterMetaFieldsState,
    setMarkdownSyntaxVisibilityState
  };
}
