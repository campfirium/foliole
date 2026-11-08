import { FolderPlus } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { NodeContextMenuItem } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeRenameContextMenuItem } from '../../features/nodes/components/NodeRenameContextMenuItem';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getDiveRepository, subscribeToDiveChanges } from '../../shared/platform/desktop/diveRepository';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { toggleCollapsed } from './WorkspaceVirtualSectionRows';

const rootId = 'workspace-dives';
const rowId = (id: string) => `dive:${id}`;
type Context = { id: string; left: number; top: number };

function useDiveRows() {
  const [dives, setDives] = useState<Dive[]>([]);
  useEffect(() => {
    const repository = getDiveRepository();
    if (!repository) return;
    let active = true;
    const changes = new Map<string, Dive>();
    const unsubscribe = subscribeToDiveChanges((dive) => {
      changes.set(dive.id, dive);
      setDives((current) => [...current.filter((entry) => entry.id !== dive.id), dive]);
    });
    void repository.list().then((result) => {
      if (!active) return;
      for (const dive of result) if (!changes.has(dive.id)) changes.set(dive.id, dive);
      setDives([...changes.values()]);
    }).catch(() => {
      if (active) setDives([...changes.values()]);
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  return [...dives].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function DiveContextMenu(props: { context: Context; onClose: () => void; onCreate: () => void }) {
  const t = useTranslation();
  const { context, onClose } = props;
  return (
    <AppDropdownMenu onOpenChange={(open) => { if (!open) onClose(); }} open>
      <AppDropdownMenuTrigger asChild>
        <button aria-hidden="true" className="pointer-events-none fixed h-0 w-0 opacity-0"
          style={{ left: context.left, top: context.top }} type="button" />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start" className="min-w-[224px] p-2"
        onCloseAutoFocus={(event) => event.preventDefault()} sideOffset={0}>
        {context.id === rootId ? (
          <NodeContextMenuItem icon={FolderPlus} onSelect={() => { onClose(); props.onCreate(); }}>
            {t('desktop.nodeList.dive.create')}
          </NodeContextMenuItem>
        ) : (
          <NodeRenameContextMenuItem onSelect={() => { onClose(); requestNodeRename(context.id); }} />
        )}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function useDiveSection() {
  const t = useTranslation();
  const dives = useDiveRows();
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [context, setContext] = useState<Context | null>(null);
  const [pendingRename, setPendingRename] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingRename || !dives.some((dive) => dive.id === pendingRename)) return;
    requestNodeRename(rowId(pendingRename));
    setPendingRename(null);
  }, [dives, pendingRename]);
  const untitled = t('desktop.nodeList.dive.untitled');
  const failed = () => showAppRuntimeNotice(t('desktop.nodeList.addToDive.saveFailed'));
  return {
    collapsed, context, dives,
    closeMenu: () => setContext(null),
    openMenu: (id: string, event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setContext({ id, left: event.clientX, top: event.clientY });
    },
    toggle: (id: string) => toggleCollapsed(id, setCollapsed),
    create: () => {
      void getDiveRepository()?.create(untitled).then((dive) => {
        setCollapsed((current) => new Set([...current].filter((id) => id !== rootId)));
        setPendingRename(dive.id);
      }).catch(failed);
    },
    rename: async (id: string, title: string) => {
      try {
        return Boolean(await getDiveRepository()?.rename(id.slice('dive:'.length), title.trim() || untitled));
      } catch {
        failed();
        return false;
      }
    }
  };
}

type DiveSectionState = ReturnType<typeof useDiveSection>;

function DiveRows(props: {
  dive: Dive;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (id: string) => void;
  section: DiveSectionState;
  activeNodeId: string | null;
}) {
  const { dive, section } = props;
  const id = rowId(dive.id);
  const collapsed = section.collapsed.has(id);
  const sources = dive.directSourceIds.flatMap((id) => props.nodesById[id] ?? []);
  return (
    <>
      <NodeTreeRow depth={1} hasChildren={sources.length > 0} isActive={false} isCollapsed={collapsed}
        isSelected={false} label={dive.title} nodeId={id} rowSpacing={getNodeListRowSpacing()} showIcon={false}
        showLeafChevronPlaceholder={false} onContextMenu={section.openMenu} onRename={section.rename}
        onSelect={() => { if (collapsed) section.toggle(id); }} onToggleCollapse={section.toggle} />
      {!collapsed ? sources.map((source) => (
        <NodeTreeRow key={source.id} depth={2} hasChildren={false} isActive={props.activeNodeId === source.id}
          isCollapsed={false} isSelected={props.activeNodeId === source.id} label={source.title}
          nodeId={`${id}:${source.id}`} showIcon={false} showLeafChevronPlaceholder={false}
          rowSpacing={getNodeListRowSpacing()} onSelect={() => props.onSelectNode(source.id)}
          onToggleCollapse={() => undefined} />
      )) : null}
    </>
  );
}

export function WorkspaceDiveSection(props: {
  nodesById: WorkspaceListNodesById;
  onSelectNode: (id: string) => void;
  activeNodeId: string | null;
}) {
  const t = useTranslation();
  const section = useDiveSection();
  if (!getDiveRepository()) return null;
  const title = t('desktop.nodeList.dive.tree');
  const collapsed = section.collapsed.has(rootId);
  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      <section aria-label={title} className="flex flex-col pt-1" role="tree">
        <NodeTreeRow depth={0} hasChildren isActive={false} isCollapsed={collapsed} isSelected={false}
          label={title} nodeId={rootId} rowSpacing={getNodeListRowSpacing()} showIcon={false}
          onContextMenu={section.openMenu} onSelect={section.toggle} onToggleCollapse={section.toggle} />
        {!collapsed ? section.dives.map((dive) => <DiveRows key={dive.id} {...props} dive={dive} section={section} />) : null}
        {section.context ? (
          <DiveContextMenu context={section.context} onClose={section.closeMenu} onCreate={section.create} />
        ) : null}
      </section>
    </div>
  );
}
