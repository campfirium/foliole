import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { collectBacklinks, type BacklinkItem } from '../features/nodes/model/internalLinks';
import type { Node } from '../features/nodes/model/nodeTypes';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionNodeBacklinks } from '../shared/platform/companion/reading/companionNodeBacklinks';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import type { CompanionReadingActivity } from './companionReadingActivity';
import { companionWorkspaceRowClass } from './CompanionWorkspaceMenuActions';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: BacklinkItem[] };

function loadBacklinks(nodeId: string, snapshot: WorkspaceSnapshot | null | undefined): Promise<BacklinkItem[]> {
  if (isAvailableNativeCompanionRuntime()) return loadCompanionNodeBacklinks(nodeId);
  if (!snapshot) return Promise.resolve([]);
  return Promise.resolve(collectBacklinks({
    targetNodeId: nodeId,
    nodeOrder: snapshot.nodeOrder,
    nodesById: snapshot.nodesById as unknown as Record<string, Node>,
    trashedNodeIds: snapshot.trashedNodeIds
  }));
}

function useBacklinksLoad(nodeId: string, snapshot: WorkspaceSnapshot | null | undefined) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    loadBacklinks(nodeId, snapshotRef.current).then(
      (items) => { if (active) setState({ status: 'ready', items }); },
      () => { if (active) setState({ status: 'error' }); }
    );
    return () => { active = false; };
  }, [nodeId, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function BacklinkRow(props: { item: BacklinkItem; disabled: boolean; onSelect(): void }) {
  const t = useTranslation();
  const { item } = props;
  return (
    <button className={`${companionWorkspaceRowClass} flex-col items-start gap-0.5 active:bg-companion-subtle/80`}
      disabled={props.disabled} onClick={props.onSelect} type="button">
      <span className="font-medium text-foreground">{item.sourceTitle}</span>
      <span className="line-clamp-2 text-companion-text-secondary">{item.context}</span>
      {item.matchCount > 1 ? <span className="text-xs text-companion-text-secondary">
        {t('desktop.links.mentionedTimes', { count: item.matchCount })}
      </span> : null}
    </button>
  );
}

function BacklinksContents(props: CompanionBacklinksSheetProps) {
  const t = useTranslation();
  const { state, retry } = useBacklinksLoad(props.nodeId, props.snapshot);
  const [busy, setBusy] = useState(false);
  const [openError, setOpenError] = useState(false);
  const opening = useRef(false);
  useLayoutEffect(() => () => { opening.current = false; }, []);
  const canOpen = Boolean(props.onOpenNode) && props.activity?.editing !== true;

  async function open(sourceNodeId: string) {
    if (opening.current || !canOpen) return;
    opening.current = true;
    setBusy(true);
    setOpenError(false);
    try {
      await props.activity?.flush();
      if (!opening.current || props.activity?.editing) return;
      props.onOpenChange(false);
      props.onOpenNode?.(sourceNodeId);
    } catch {
      if (opening.current) setOpenError(true);
    } finally {
      if (opening.current) {
        opening.current = false;
        setBusy(false);
      }
    }
  }

  if (state.status === 'loading') {
    return <div aria-busy="true" className="min-h-11" />;
  }
  if (state.status === 'error') {
    return <div className="flex items-center justify-between gap-3 py-3" role="alert">
      <span className="text-sm text-error">{t('desktop.backlinks.error.title')}</span>
      <button className="min-h-11 px-3 text-sm font-medium text-foreground" onClick={retry} type="button">
        {t('desktop.backlinks.retry')}
      </button>
    </div>;
  }
  if (!state.items.length) {
    return <p className="py-5 text-center text-sm text-companion-text-secondary" role="status">{t('desktop.links.empty')}</p>;
  }
  return <>
    {openError ? <p className="py-3 text-sm text-error" role="alert">{t('companion.reading.outline.openError')}</p> : null}
    <div aria-label={t('desktop.links.backlinks')} role="list">
      {state.items.map((item) => <div key={item.sourceNodeId} role="listitem">
        <BacklinkRow item={item} disabled={busy || !canOpen} onSelect={() => void open(item.sourceNodeId)} />
      </div>)}
    </div>
  </>;
}

interface CompanionBacklinksSheetProps {
  activity?: CompanionReadingActivity | undefined;
  nodeId: string;
  snapshot?: WorkspaceSnapshot | null | undefined;
  onOpenChange(open: boolean): void;
  onOpenNode?: ((nodeId: string) => void) | undefined;
  open: boolean;
}

export function CompanionBacklinksSheet(props: CompanionBacklinksSheetProps) {
  const t = useTranslation();
  return <CompanionBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('desktop.links.backlinks')}>
    {props.open ? <BacklinksContents key={props.nodeId} {...props} /> : null}
  </CompanionBottomSheet>;
}

export function useCompanionBacklinksSheet(args: Omit<CompanionBacklinksSheetProps, 'onOpenChange' | 'open'> & { disabled?: boolean | undefined }) {
  const [open, setOpen] = useState(false);
  const available = Boolean(args.onOpenNode) && args.disabled !== true;
  return {
    openSheet: available ? () => setOpen(true) : undefined,
    sheet: <CompanionBacklinksSheet activity={args.activity} nodeId={args.nodeId} snapshot={args.snapshot}
      onOpenChange={setOpen} onOpenNode={args.onOpenNode} open={open && available} />
  };
}
