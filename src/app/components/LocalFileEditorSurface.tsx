import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { AppButton } from '../../shared/ui';

import { useLocalFileEditorSurface, type LocalFileSaveStatus } from './useLocalFileEditorSurface';

function statusLabel(status: LocalFileSaveStatus) {
  if (status === 'conflict') return 'External change';
  if (status === 'error') return 'Save failed';
  if (status === 'missing') return 'Missing file';
  if (status === 'saving') return 'Saving';
  if (status === 'unsaved') return 'Unsaved';
  return 'Saved';
}

export function LocalFileEditorSurface() {
  const model = useLocalFileEditorSurface();
  const { entries, importStatus, session, status } = model;

  if (!session) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 grid grid-cols-[18rem_minmax(0,1fr)] bg-background text-foreground">
      <aside className="border-r border-border bg-bg-panel p-3">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/55">Recent files</div>
        <div className="space-y-1">
          {entries.map((entry) => (
            <button
              className="block w-full rounded-md px-2 py-2 text-left text-sm text-foreground/78 hover:bg-foreground/[0.06]"
              key={entry.id}
              onClick={() => void model.openPathAfterFlush(entry.absolutePath)}
              type="button"
            >
              <span className="block truncate font-medium">{entry.title}</span>
              <span className="block truncate text-xs text-foreground/45">{entry.absolutePath}</span>
            </button>
          ))}
        </div>
      </aside>
      <main className="flex min-h-0 flex-col bg-canvas">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{session?.document.title ?? 'Local file'}</div>
            <div className="truncate text-xs text-foreground/48">{session?.document.absolutePath ?? ''}</div>
          </div>
          <div className="flex items-center gap-2">
            {importStatus ? <span className="text-xs text-foreground/55">{importStatus}</span> : null}
            <span className="text-xs text-foreground/55">{statusLabel(status)}</span>
            {status === 'conflict' ? (
              <>
                <AppButton onClick={() => void model.flushSave(true)} size="sm" variant="default">Save mine</AppButton>
                <AppButton onClick={() => void model.reloadFromDisk()} size="sm" variant="ghost">Reload</AppButton>
              </>
            ) : null}
            <AppButton onClick={() => void model.importAsTopic()} size="sm" variant="ghost">Import as Topic</AppButton>
            <AppButton onClick={() => void model.closeSession()} size="sm" variant="ghost">Close</AppButton>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          {session ? (
            <MarkdownEditor
              className="h-full"
              localDocumentPath={session.document.absolutePath}
              nodeId={null}
              onChange={model.handleChange}
              value={session.content}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
