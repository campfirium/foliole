import type { CSSProperties } from 'react';

import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import { WindowTitleBar } from './WindowTitleBar';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

interface WorkspaceContentProps {
  documentNodeId: string | null;
  props: WorkspaceLayoutProps;
}

function ListStudyStatusBar({ isStudyMode, reviewDueCount }: { isStudyMode: boolean; reviewDueCount: number }) {
  if (!isStudyMode) {
    return null;
  }
  return (
    <div className="flex h-[56px] flex-none items-center border-t border-border bg-bg-panel px-3">
      <p className="truncate text-xs font-medium text-foreground/70">Reviewing · {Math.max(reviewDueCount, 0)} due</p>
    </div>
  );
}

function WorkspaceListArea({ props }: { props: WorkspaceLayoutProps }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-bg-panel text-foreground">
      <NodeListTree
        activeNodeId={props.activeNodeId}
        isTrashViewOpen={props.isTrashViewOpen}
        nodeOrder={props.nodeOrder}
        nodesById={props.nodesById}
        onOpenNotesView={props.onOpenNotesView}
        onSelectNode={props.onSelectNode}
        onSelectTrashNode={props.onSelectTrashNode}
        selectedTrashNodeId={props.selectedTrashNodeId}
      />
      <ListStudyStatusBar isStudyMode={props.isStudyMode} reviewDueCount={props.reviewDueCount} />
    </div>
  );
}

function WorkspaceDocumentArea({ documentNodeId, props }: WorkspaceContentProps) {
  return (
    <section aria-label="Document and review area" className="flex min-h-0 flex-1 flex-col gap-0">
      <DocumentPanelSection
        activeNodeId={documentNodeId}
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        canGoParent={props.canGoParent}
        contextMenu={props.contextMenu}
        documentMaxWidth={props.documentMaxWidth}
        editorAppearanceKey={`${props.markdownSyntaxVisibility}-${props.editorDisplayMode}`}
        editorContent={props.editorContent}
        editorDisplayMode={props.editorDisplayMode}
        editorNodeId={props.editorNodeId}
        editorNodeViewState={props.editorNodeViewState}
        isDocumentResizing={props.isDocumentResizing}
        nodesById={props.nodesById}
        onAnswerChange={props.onAnswerChange}
        onCloseContextMenu={props.onCloseContextMenu}
        onCreateCloze={props.onCreateCloze}
        onCreateHighlight={props.onCreateHighlight}
        onEditorChange={props.onEditorChange}
        onEditorContextMenu={props.onEditorContextMenu}
        onEditorReady={props.onEditorReady}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
        onGoParent={props.onGoParent}
        onResetLayout={props.onResetLayout}
        onSelectNode={props.onSelectBreadcrumbNode}
        onStartDocumentResize={props.onStartDocumentResize}
        onToggleEditorDisplayMode={props.onToggleEditorDisplayMode}
        showAnswerSection={props.showAnswerSection}
      />
      <ReviewModeToolbar
        isAnswerRevealed={props.isAnswerRevealed}
        isStudyMode={props.isStudyMode}
        reviewCurrentNodeId={props.reviewCurrentNodeId}
        onExitReviewMode={props.onExitReviewMode}
        onGrade={props.onGradeReview}
        onRevealAnswer={props.onRevealAnswer}
      />
    </section>
  );
}

function WorkspaceGrid({ documentNodeId, props }: WorkspaceContentProps) {
  return (
    <div className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]" style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}>
      <div className="h-full bg-[#f6f6f6] max-[1080px]:hidden">
        <WorkspaceSideToolbar
          canStartStudyMode={props.canStartStudyMode}
          isStudyMode={props.isStudyMode}
          isSettingsOpen={props.isSettingsOpen}
          reviewDueCount={props.reviewDueCount}
          onOpenSettings={props.onOpenSettings}
          onToggleReviewSession={props.onToggleReviewSession}
        />
      </div>
      <div className="col-start-2 min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1">
        <div
          className="grid h-full min-h-0 gap-0 overflow-hidden max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]"
          data-resizing={props.isResizingList}
          style={{ gridTemplateColumns: 'minmax(0, var(--workspace-list-width, 300px)) 1px minmax(0, 1fr)' }}
        >
          <WorkspaceListArea props={props} />
          <WorkspaceListSplitter
            isResizingList={props.isResizingList}
            listWidth={props.listWidth}
            onResetLayout={props.onResetLayout}
            onSplitterKeyDown={props.onSplitterKeyDown}
            onSplitterPointerDown={props.onSplitterPointerDown}
          />
          <WorkspaceDocumentArea documentNodeId={documentNodeId} props={props} />
        </div>
      </div>
    </div>
  );
}

function SettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  if (!props.isSettingsOpen) {
    return null;
  }

  return (
    <SettingsPanel
      customUiFont={props.customUiFont}
      customInterfaceFont={props.customInterfaceFont}
      customMonospaceFont={props.customMonospaceFont}
      baseColorMode={props.baseColorMode}
      accentColorPreset={props.accentColorPreset}
      uiFontPreset={props.uiFontPreset}
      interfaceFontPreset={props.interfaceFontPreset}
      interfaceFontSize={props.interfaceFontSize}
      hotkeyItems={props.hotkeyItems}
      markdownSyntaxVisibility={props.markdownSyntaxVisibility}
      monospaceFontPreset={props.monospaceFontPreset}
      onClose={props.onCloseSettings}
      onBaseColorModeChange={props.onBaseColorModeChange}
      onAccentColorPresetChange={props.onAccentColorPresetChange}
      onAccentColorPresetReset={props.onAccentColorPresetReset}
      onUiFontPresetChange={props.onUiFontPresetChange}
      onCustomUiFontChange={props.onCustomUiFontChange}
      onCustomInterfaceFontChange={props.onCustomInterfaceFontChange}
      onInterfaceFontPresetChange={props.onInterfaceFontPresetChange}
      onCustomMonospaceFontChange={props.onCustomMonospaceFontChange}
      onInterfaceFontSizeChange={props.onInterfaceFontSizeChange}
      onInterfaceFontSizeReset={props.onInterfaceFontSizeReset}
      onMarkdownSyntaxVisibilityChange={props.onMarkdownSyntaxVisibilityChange}
      onMonospaceFontPresetChange={props.onMonospaceFontPresetChange}
      onHotkeyUpdate={props.onHotkeyUpdate}
      onHotkeyReset={props.onHotkeyReset}
      onHotkeyResetAll={props.onHotkeyResetAll}
    />
  );
}

export function WorkspaceLayoutMain(props: WorkspaceLayoutProps) {
  const workspaceGridStyle = {
    '--workspace-list-width': `${props.listWidth}px`
  } as CSSProperties;
  const documentNodeId = props.isViewingTrashNode ? props.selectedTrashNodeId : props.activeNodeId;

  return (
    <main aria-label="Foliole workspace" className="relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-10 w-px bg-border max-[1080px]:hidden"
        style={{ left: 'calc(40px + var(--workspace-list-width, 300px))' }}
      />
      <WindowTitleBar
        isListHidden={props.listWidth <= 0}
        isTrashViewOpen={props.isTrashViewOpen}
        listWidth={props.listWidth}
        onOpenNotesView={props.onOpenNotesView}
        onOpenTrashView={props.onOpenTrashView}
        onToggleListVisibility={props.onToggleListVisibility}
      />
      <section aria-label="Workspace top toolbar" className="sr-only" />
      <WorkspaceGrid documentNodeId={documentNodeId} props={props} />
      <SettingsOverlay props={props} />
    </main>
  );
}
