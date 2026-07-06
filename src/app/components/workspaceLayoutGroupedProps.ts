import type { ReactNode } from 'react';

import {
  DOCUMENT_KEYS,
  EDITOR_COMMAND_KEYS,
  EXTERNAL_LIBRARY_KEYS,
  IMPORT_KEYS,
  LAYOUT_CHROME_KEYS,
  NAVIGATION_KEYS,
  NODE_LIST_KEYS,
  READING_POSITION_KEYS,
  REVIEW_KEYS,
  SETTINGS_KEYS,
  TRASH_KEYS,
  VIRTUAL_VIEW_KEYS,
  pickLayoutProps
} from './workspaceLayoutGroupedPropKeys';
import type {
  WorkspaceLayoutChromeProps,
  WorkspaceLayoutDocumentProps,
  WorkspaceLayoutEditorCommandProps,
  WorkspaceLayoutExternalLibraryProps,
  WorkspaceLayoutFlatProps,
  WorkspaceLayoutImportProps,
  WorkspaceLayoutNavigationProps,
  WorkspaceLayoutNodeListProps,
  WorkspaceLayoutReadingPositionProps,
  WorkspaceLayoutReviewProps,
  WorkspaceLayoutSettingsProps,
  WorkspaceLayoutTrashProps,
  WorkspaceLayoutVirtualViewProps
} from './workspaceLayoutPropGroups';

export interface WorkspaceLayoutProps {
  overlay?: ReactNode;
  navigation: WorkspaceLayoutNavigationProps;
  document: WorkspaceLayoutDocumentProps;
  editorCommands: WorkspaceLayoutEditorCommandProps;
  readingPosition: WorkspaceLayoutReadingPositionProps;
  review: WorkspaceLayoutReviewProps;
  layoutChrome: WorkspaceLayoutChromeProps;
  imports: WorkspaceLayoutImportProps;
  externalLibrary: WorkspaceLayoutExternalLibraryProps;
  settings: WorkspaceLayoutSettingsProps;
  nodeList: WorkspaceLayoutNodeListProps;
  trash: WorkspaceLayoutTrashProps;
  virtualView: WorkspaceLayoutVirtualViewProps;
}

export function groupWorkspaceLayoutProps(flatProps: WorkspaceLayoutFlatProps): WorkspaceLayoutProps {
  return {
    navigation: pickLayoutProps(flatProps, NAVIGATION_KEYS),
    document: pickLayoutProps(flatProps, DOCUMENT_KEYS),
    editorCommands: pickLayoutProps(flatProps, EDITOR_COMMAND_KEYS),
    readingPosition: pickLayoutProps(flatProps, READING_POSITION_KEYS),
    review: pickLayoutProps(flatProps, REVIEW_KEYS),
    layoutChrome: pickLayoutProps(flatProps, LAYOUT_CHROME_KEYS),
    imports: pickLayoutProps(flatProps, IMPORT_KEYS),
    externalLibrary: pickLayoutProps(flatProps, EXTERNAL_LIBRARY_KEYS),
    settings: pickLayoutProps(flatProps, SETTINGS_KEYS),
    nodeList: pickLayoutProps(flatProps, NODE_LIST_KEYS),
    trash: pickLayoutProps(flatProps, TRASH_KEYS),
    virtualView: pickLayoutProps(flatProps, VIRTUAL_VIEW_KEYS)
  };
}
