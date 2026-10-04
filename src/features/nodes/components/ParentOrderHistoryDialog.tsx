import { useEffect, useRef, useState } from 'react';

import { loadSavedArrangements, restoreSavedArrangement, type SavedParentOrderHistory } from '../../../shared/platform/desktop/parentOrderHistory';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import { refreshWorkspaceState } from '../../../store/workspaceRefreshScheduler';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

type SavedArrangement = SavedParentOrderHistory['versions'][number];

function useParentOrderHistory(parentId: string, onClose: () => void) {
  const active = useRef(false);
  const [history, setHistory] = useState<SavedParentOrderHistory | null>(null);
  const [selected, setSelected] = useState<SavedArrangement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    active.current = true;
    void loadSavedArrangements({ parentId }).then((page) => {
      if (!cancelled) setHistory(page);
    }).catch(() => { if (!cancelled) setError('Saved arrangements could not be loaded.'); });
    return () => { cancelled = true; active.current = false; };
  }, [parentId]);

  async function loadMore() {
    if (!history?.nextAfter) return;
    setBusy(true);
    setError(null);
    try {
      const page = await loadSavedArrangements({
        parentId, afterVersionId: history.nextAfter
      });
      if (active.current) setHistory({ ...page, versions: [...history.versions, ...page.versions] });
    } catch { setError('Saved arrangements could not be loaded.'); }
    finally { setBusy(false); }
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await restoreSavedArrangement({
        parentId, versionId: selected.versionId
      });
    } catch {
      setError('The arrangement could not be restored.');
      setBusy(false);
      return;
    }
    try {
      await refreshWorkspaceState('content-changed');
      if (active.current) onClose();
    } catch { setError('The arrangement was restored, but the view could not be refreshed.'); }
    finally { setBusy(false); }
  }

  return { history, selected, setSelected, busy, error, loadMore, restore };
}

interface HistoryDialogProps {
  parentId: string;
  nodesById: WorkspaceListNodesById;
  onClose(): void;
}

export function ParentOrderHistoryDialog(props: HistoryDialogProps) {
  return <ParentOrderHistoryContents key={props.parentId} {...props} />;
}

function ParentOrderHistoryContents(props: HistoryDialogProps) {
  const { history, selected, setSelected, busy, error, loadMore, restore } =
    useParentOrderHistory(props.parentId, props.onClose);
  const arrangements = history?.versions.filter((version) => version.kind === 'user') ?? [];
  return <AppDialog open onOpenChange={(open) => { if (!open && !busy) props.onClose(); }}>
    <AppDialogPortal><AppDialogOverlay /><AppDialogContent layout="task" className="w-[560px] max-w-[90vw]">
      <AppDialogTitle>Saved arrangements</AppDialogTitle>
      <AppDialogBody className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        <AppDialogDescription>Restoring changes the current order and keeps later additions. Deleted or moved topics and folders stay where they are.</AppDialogDescription>
        {!history && !error ? <p>Loading…</p> : null}
        {history && !arrangements.length ? <p>No saved arrangements on this page.</p> : null}
        {arrangements.map((arrangement) => <AppButton key={arrangement.versionId}
          variant="list" disabled={busy} aria-pressed={selected?.versionId === arrangement.versionId}
          onClick={() => setSelected(arrangement)}>
          {new Date(arrangement.createdAt).toLocaleString()}
          {arrangement.versionId === history?.currentVersionId ? ' · Current' : ''}
        </AppButton>)}
        {history?.nextAfter ? <AppButton variant="ghost" disabled={busy} onClick={() => void loadMore()}>Load more</AppButton> : null}
        {selected ? <ol aria-label="Saved order" className="list-decimal space-y-1 pl-6">
          {selected.order.map((id) => <li key={id}>{props.nodesById[id]?.title || 'Removed topic or folder'}</li>)}
        </ol> : null}
        {error ? <p role="alert">{error}</p> : null}
      </AppDialogBody>
      <AppDialogActions>
        <AppButton variant="ghost" disabled={busy} onClick={props.onClose}>Close</AppButton>
        <AppButton disabled={busy || !selected} onClick={() => void restore()}>Restore arrangement</AppButton>
      </AppDialogActions>
    </AppDialogContent></AppDialogPortal>
  </AppDialog>;
}
