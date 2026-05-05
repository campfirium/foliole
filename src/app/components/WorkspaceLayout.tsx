import type { CSSProperties, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import type { MarkdownSyntaxVisibility } from '../../features/editor/model/markdownSyntaxSetting';
import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { SettingsPanel } from '../../features/settings/components/SettingsPanel';
import type {
  AccentColorPreset,
  BaseColorMode,
  InterfaceFontPreset,
  MonospaceFontPreset
} from '../../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelSection } from './DocumentPanelSection';
import { ReviewModeToolbar } from './ReviewModeToolbar';
import { WindowTitleBar } from './WindowTitleBar';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';
export interface WorkspaceEditorContextMenu {
  canRunCommands: boolean;
  left: number;
  top: number;
}
export interface WorkspaceLayoutProps {
  activeNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  canStartStudyMode: boolean;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  isAnswerRevealed: boolean;
  isDocumentResizing: boolean;
  isResizingList: boolean;
  isTrashViewOpen: boolean;
  isViewingTrashNode: boolean;
  showAnswerSection: boolean;
  listWidth: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onToggleListVisibility: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onCloseContextMenu: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onStartDocumentResize: (side: ResizeSide, event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onStartStudyMode: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onBaseColorModeChange: (value: BaseColorMode) => void;
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onInterfaceFontPresetChange: (value: InterfaceFontPreset) => void;
  onUiFontPresetChange: (value: InterfaceFontPreset) => void;
  onCustomUiFontChange: (value: string) => void;
  onCustomInterfaceFontChange: (value: string) => void;
  onMonospaceFontPresetChange: (value: MonospaceFontPreset) => void;
  onCustomMonospaceFontChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
  onToggleEditorDisplayMode: () => void;
  onRevealAnswer: () => void;
  onGradeReview: (grade: ReviewGrade) => void;
  customUiFont: string;
  customInterfaceFont: string;
  customMonospaceFont: string;
  baseColorMode: BaseColorMode;
  accentColorPreset: AccentColorPreset;
  uiFontPreset: InterfaceFontPreset;
  interfaceFontPreset: InterfaceFontPreset;
  interfaceFontSize: number;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  editorDisplayMode: EditorDisplayMode;
  monospaceFontPreset: MonospaceFontPreset;
  hotkeyItems: HotkeySettingItem[];
  selectedTrashNodeId: string | null;
  onHotkeyUpdate: (commandId: string, nextLabel: string) => HotkeyUpdateResult;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
}
export function WorkspaceLayout({
  activeNodeId,
  canGoBack,
  canGoForward,
  canGoParent,
  contextMenu,
  documentMaxWidth,
  editorContent,
  editorNodeId,
  editorNodeViewState,
  canStartStudyMode,
  isStudyMode,
  isSettingsOpen,
  isAnswerRevealed,
  isDocumentResizing,
  isResizingList,
  isTrashViewOpen,
  isViewingTrashNode,
  showAnswerSection,
  listWidth,
  nodeOrder,
  nodesById,
  onAnswerChange,
  onEditorChange,
  onEditorReady,
  onEditorContextMenu,
  onResetLayout,
  onSelectBreadcrumbNode,
  onSelectNode,
  onSelectTrashNode,
  onSplitterKeyDown,
  onSplitterPointerDown,
  onOpenNotesView,
  onOpenTrashView,
  onToggleListVisibility,
  onGoBack,
  onGoForward,
  onGoParent,
  onCloseContextMenu,
  onCreateHighlight,
  onCreateCloze,
  onStartDocumentResize,
  onStartStudyMode,
  onOpenSettings,
  onCloseSettings,
  onBaseColorModeChange,
  onAccentColorPresetChange,
  onAccentColorPresetReset,
  onInterfaceFontPresetChange,
  onUiFontPresetChange,
  onCustomUiFontChange,
  onCustomInterfaceFontChange,
  onMonospaceFontPresetChange,
  onCustomMonospaceFontChange,
  onInterfaceFontSizeChange,
  onInterfaceFontSizeReset,
  onMarkdownSyntaxVisibilityChange,
  onToggleEditorDisplayMode,
  onRevealAnswer,
  onGradeReview,
  customUiFont,
  customInterfaceFont,
  customMonospaceFont,
  baseColorMode,
  accentColorPreset,
  uiFontPreset,
  interfaceFontPreset,
  interfaceFontSize,
  markdownSyntaxVisibility,
  editorDisplayMode,
  monospaceFontPreset,
  hotkeyItems,
  selectedTrashNodeId,
  onHotkeyUpdate,
  onHotkeyReset,
  onHotkeyResetAll
}: WorkspaceLayoutProps) {
  const workspaceGridStyle = {
    '--workspace-list-width': `${listWidth}px`
  } as CSSProperties;
  const documentNodeId = isViewingTrashNode ? selectedTrashNodeId : activeNodeId;
  return (
    <main aria-label="Foliole workspace" className="relative flex h-dvh flex-col overflow-hidden p-0" style={workspaceGridStyle}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-10 w-px bg-border max-[1080px]:hidden"
        style={{ left: 'calc(40px + var(--workspace-list-width, 300px))' }}
      />
      <WindowTitleBar
        isListHidden={listWidth <= 0}
        isTrashViewOpen={isTrashViewOpen}
        listWidth={listWidth}
        onOpenNotesView={onOpenNotesView}
        onOpenTrashView={onOpenTrashView}
        onToggleListVisibility={onToggleListVisibility}
      />
      <section aria-label="Workspace top toolbar" className="sr-only" />
      <div
        className="grid min-h-0 flex-1 overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]"
        style={{ gridTemplateColumns: '40px minmax(0, 1fr)' }}
      >
        <div className="h-full bg-[#f6f6f6] max-[1080px]:hidden">
          <WorkspaceSideToolbar
            canStartStudyMode={canStartStudyMode}
            isStudyMode={isStudyMode}
            isSettingsOpen={isSettingsOpen}
            onOpenSettings={onOpenSettings}
            onStartStudyMode={onStartStudyMode}
          />
        </div>
        <div className="col-start-2 min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1">
          <div
            className="grid h-full min-h-0 gap-0 overflow-hidden max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]"
            data-resizing={isResizingList}
            style={{ gridTemplateColumns: 'minmax(0, var(--workspace-list-width, 300px)) 1px minmax(0, 1fr)' }}
          >
            <NodeListTree
              activeNodeId={activeNodeId}
              isTrashViewOpen={isTrashViewOpen}
              nodeOrder={nodeOrder}
              nodesById={nodesById}
              onOpenNotesView={onOpenNotesView}
              onSelectNode={onSelectNode}
              onSelectTrashNode={onSelectTrashNode}
              selectedTrashNodeId={selectedTrashNodeId}
            />
            <WorkspaceListSplitter
              isResizingList={isResizingList}
              listWidth={listWidth}
              onResetLayout={onResetLayout}
              onSplitterKeyDown={onSplitterKeyDown}
              onSplitterPointerDown={onSplitterPointerDown}
            />
            <section aria-label="Document and review area" className="flex min-h-0 flex-1 flex-col gap-0">
              <DocumentPanelSection
                activeNodeId={documentNodeId}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                canGoParent={canGoParent}
                contextMenu={contextMenu}
                documentMaxWidth={documentMaxWidth}
                editorAppearanceKey={`${markdownSyntaxVisibility}-${editorDisplayMode}`}
                editorContent={editorContent}
                editorDisplayMode={editorDisplayMode}
                editorNodeId={editorNodeId}
                editorNodeViewState={editorNodeViewState}
                isDocumentResizing={isDocumentResizing}
                nodesById={nodesById}
                onAnswerChange={onAnswerChange}
                onCloseContextMenu={onCloseContextMenu}
                onCreateCloze={onCreateCloze}
                onCreateHighlight={onCreateHighlight}
                onEditorChange={onEditorChange}
                onEditorContextMenu={onEditorContextMenu}
                onEditorReady={onEditorReady}
                onGoBack={onGoBack}
                onGoForward={onGoForward}
                onGoParent={onGoParent}
                onResetLayout={onResetLayout}
                onSelectNode={onSelectBreadcrumbNode}
                onStartDocumentResize={onStartDocumentResize}
                onToggleEditorDisplayMode={onToggleEditorDisplayMode}
                showAnswerSection={showAnswerSection}
              />
              <ReviewModeToolbar
                canStartStudyMode={canStartStudyMode}
                isAnswerRevealed={isAnswerRevealed}
                isStudyMode={isStudyMode}
                onGrade={onGradeReview}
                onRevealAnswer={onRevealAnswer}
                onStartStudyMode={onStartStudyMode}
              />
            </section>
          </div>
        </div>
      </div>
      {isSettingsOpen ? (
        <SettingsPanel
          customUiFont={customUiFont}
          customInterfaceFont={customInterfaceFont}
          customMonospaceFont={customMonospaceFont}
          baseColorMode={baseColorMode}
          accentColorPreset={accentColorPreset}
          uiFontPreset={uiFontPreset}
          interfaceFontPreset={interfaceFontPreset}
          interfaceFontSize={interfaceFontSize}
          hotkeyItems={hotkeyItems}
          markdownSyntaxVisibility={markdownSyntaxVisibility}
          monospaceFontPreset={monospaceFontPreset}
          onClose={onCloseSettings}
          onBaseColorModeChange={onBaseColorModeChange}
          onAccentColorPresetChange={onAccentColorPresetChange}
          onAccentColorPresetReset={onAccentColorPresetReset}
          onUiFontPresetChange={onUiFontPresetChange}
          onCustomUiFontChange={onCustomUiFontChange}
          onCustomInterfaceFontChange={onCustomInterfaceFontChange}
          onInterfaceFontPresetChange={onInterfaceFontPresetChange}
          onCustomMonospaceFontChange={onCustomMonospaceFontChange}
          onInterfaceFontSizeChange={onInterfaceFontSizeChange}
          onInterfaceFontSizeReset={onInterfaceFontSizeReset}
          onMarkdownSyntaxVisibilityChange={onMarkdownSyntaxVisibilityChange}
          onMonospaceFontPresetChange={onMonospaceFontPresetChange}
          onHotkeyUpdate={onHotkeyUpdate}
          onHotkeyReset={onHotkeyReset}
          onHotkeyResetAll={onHotkeyResetAll}
        />
      ) : null}
    </main>
  );
}
