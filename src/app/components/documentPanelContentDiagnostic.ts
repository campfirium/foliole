import type { ComponentProps } from 'react';

import { DocumentPanelBody } from './DocumentPanelBody';
import { startDocumentPanelDiagnostic } from './documentPanelSectionDiagnostic';
import type { DocumentPanelContent } from './DocumentPanelSectionParts';

type DocumentPanelContentProps = ComponentProps<typeof DocumentPanelContent>;

export function startDocumentPanelContentDiagnostic(props: {
  activeNodeId: DocumentPanelContentProps['activeNodeId'];
  bodyProps: ComponentProps<typeof DocumentPanelBody>;
  isFolderListView: DocumentPanelContentProps['isFolderListView'];
}) {
  return startDocumentPanelDiagnostic('document-panel-content-render', {
    activeNodeId: props.activeNodeId,
    editorContentLength: props.bodyProps.editorContent.length,
    isFolderListView: props.isFolderListView
  });
}
