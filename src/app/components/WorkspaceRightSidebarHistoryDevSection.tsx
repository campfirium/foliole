import { useShallow } from 'zustand/react/shallow';

import type { EditorOperationHistoryEntry } from '../../features/editor/model/editorOperationHistory';
import { InspectorSection } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface WorkspaceRightSidebarHistoryDevSectionProps {
  activeNodeId: string;
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

function formatEntryTarget(entry: EditorOperationHistoryEntry | null) {
  return entry?.nodeId ?? 'None';
}

function formatEntrySummary(entry: EditorOperationHistoryEntry | null) {
  if (!entry) {
    return 'None';
  }
  if (entry.type === 'text.edit') {
    return `${entry.title} | ${entry.beforeContent.length} -> ${entry.afterContent.length} chars`;
  }
  return `${entry.title} | ${entry.annotations.length} item${entry.annotations.length === 1 ? '' : 's'}`;
}

function getEntryNodeIds(entry: EditorOperationHistoryEntry) {
  if (entry.type === 'text.edit') {
    return entry.nodeId;
  }
  const annotationIds = entry.annotations.map((annotation) => annotation.nodeId).join(', ');
  return annotationIds ? `${entry.nodeId} -> ${annotationIds}` : entry.nodeId;
}

function HistoryInfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-foreground/55">{label}</dt>
      <dd className={`min-w-0 break-all text-right text-foreground ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </>
  );
}

function HistoryEntryList({
  entries,
  label
}: {
  entries: EditorOperationHistoryEntry[];
  label: string;
}) {
  const recentEntries = entries.slice(-5).reverse();
  if (recentEntries.length === 0) {
    return <p className="text-[13px] text-foreground/55">No {label.toLowerCase()} entries.</p>;
  }
  return (
    <ol aria-label={label} className="flex flex-col gap-2">
      {recentEntries.map((entry, index) => (
        <li className="rounded-md border border-border/70 bg-background/55 px-2 py-1.5" key={`${entry.type}-${entry.nodeId}-${index}`}>
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="font-medium text-foreground">{entry.type}</span>
            <span className="text-foreground/60">{entry.title}</span>
          </div>
          <p className="mt-1 break-all font-mono text-[11px] text-foreground/60">{getEntryNodeIds(entry)}</p>
        </li>
      ))}
    </ol>
  );
}

export function WorkspaceRightSidebarHistoryDevSection(props: WorkspaceRightSidebarHistoryDevSectionProps) {
  const { appActionHistory, editorOperationHistory } = useWorkspaceStore(
    useShallow((state) => ({
      appActionHistory: state.appActionHistory,
      editorOperationHistory: state.editorOperationHistory
    }))
  );
  const undoEntry = editorOperationHistory.undoStack.at(-1) ?? null;
  const redoEntry = editorOperationHistory.redoStack.at(-1) ?? null;
  const canUndoEditorForActiveNode = undoEntry?.nodeId === props.activeNodeId;
  const canRedoEditorForActiveNode = redoEntry?.nodeId === props.activeNodeId;

  return (
    <InspectorSection
      contentClassName="flex flex-col gap-3"
      description="Diagnostic view for editor and workspace undo state."
      title="History"
    >
      <dl className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <HistoryInfoRow label="Active node" value={props.activeNodeId} mono />
        <HistoryInfoRow label="Editor undo" value={String(editorOperationHistory.undoStack.length)} />
        <HistoryInfoRow label="Editor redo" value={String(editorOperationHistory.redoStack.length)} />
        <HistoryInfoRow label="Undo target" value={formatEntryTarget(undoEntry)} mono={Boolean(undoEntry)} />
        <HistoryInfoRow label="Redo target" value={formatEntryTarget(redoEntry)} mono={Boolean(redoEntry)} />
        <HistoryInfoRow label="Undo matches" value={formatBoolean(canUndoEditorForActiveNode)} />
        <HistoryInfoRow label="Redo matches" value={formatBoolean(canRedoEditorForActiveNode)} />
        <HistoryInfoRow label="Undo top" value={formatEntrySummary(undoEntry)} />
        <HistoryInfoRow label="Redo top" value={formatEntrySummary(redoEntry)} />
        <HistoryInfoRow label="Workspace undo" value={String(appActionHistory.undoStack.length)} />
        <HistoryInfoRow label="Workspace redo" value={String(appActionHistory.redoStack.length)} />
      </dl>
      <HistoryEntryList entries={editorOperationHistory.undoStack} label="Recent editor undo entries" />
      <HistoryEntryList entries={editorOperationHistory.redoStack} label="Recent editor redo entries" />
    </InspectorSection>
  );
}
