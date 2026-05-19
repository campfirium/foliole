import { useState } from 'react';

import { getEditorDisplayMode } from '../../editor/model/editorDisplayMode';
import { getFrontmatterDisplayMode } from '../../editor/model/frontmatterDisplayModeSetting';
import { getFrontmatterMetaFields } from '../../editor/model/frontmatterMetaFieldsSetting';
import { getMarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import { shouldAutoLocalizeRemoteImages as getAutoLocalizeRemoteImages } from '../../editor/model/remoteImageLocalizationSetting';
import {
  getSelectionToolbarEnabled,
  getSelectionToolbarOpacityPercent
} from '../../editor/model/selectionToolbarSettings';

export function useEditorSettingsStateValues() {
  const [autoLocalizeRemoteImagesState, setAutoLocalizeRemoteImagesState] = useState(() => getAutoLocalizeRemoteImages());
  const [frontmatterDisplayModeState, setFrontmatterDisplayModeState] = useState(() => getFrontmatterDisplayMode());
  const [frontmatterMetaFieldsState, setFrontmatterMetaFieldsState] = useState(() => getFrontmatterMetaFields());
  const [markdownSyntaxVisibilityState, setMarkdownSyntaxVisibilityState] = useState(() => getMarkdownSyntaxVisibility());
  const [editorDisplayModeState, setEditorDisplayModeState] = useState(() => getEditorDisplayMode());
  const [selectionToolbarEnabledState, setSelectionToolbarEnabledState] = useState(() => getSelectionToolbarEnabled());
  const [selectionToolbarOpacityPercentState, setSelectionToolbarOpacityPercentState] =
    useState(() => getSelectionToolbarOpacityPercent());

  return {
    autoLocalizeRemoteImagesState,
    editorDisplayModeState,
    frontmatterDisplayModeState,
    frontmatterMetaFieldsState,
    markdownSyntaxVisibilityState,
    selectionToolbarEnabledState,
    selectionToolbarOpacityPercentState,
    setAutoLocalizeRemoteImagesState,
    setEditorDisplayModeState,
    setFrontmatterDisplayModeState,
    setFrontmatterMetaFieldsState,
    setMarkdownSyntaxVisibilityState,
    setSelectionToolbarEnabledState,
    setSelectionToolbarOpacityPercentState
  };
}
