import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDisplayMode } from '../../features/editor/model/editorDisplayMode';
import type { MarkdownSyntaxVisibility } from '../../features/editor/model/markdownSyntaxSetting';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type {
  AccentColorPreset,
  BaseColorMode,
  InterfaceFontPreset,
  MonospaceFontPreset
} from '../../features/settings/model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../../features/settings/model/hotkeySettings';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';

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
  reviewDueCount: number;
  reviewPreview: SchedulerPreviewResult | null;
  isStudyMode: boolean;
  isSettingsOpen: boolean;
  isAnswerRevealed: boolean;
  isReviewEditing: boolean;
  reviewCurrentNodeId: string | null;
  reviewQueueCount: number;
  reviewCompletedCount: number;
  reviewStatus: 'awaiting-answer' | 'answer-revealed' | 'completed';
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
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  onStartStudyMode: () => void;
  onToggleReviewSession: () => void;
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
  onGradeReview: (grade: ReviewGrade) => Promise<boolean>;
  onExitReviewMode: () => void;
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

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  return <WorkspaceLayoutMain {...props} />;
}
