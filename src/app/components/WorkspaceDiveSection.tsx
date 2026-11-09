import { FolderPlus, ListMinus, Play } from 'lucide-react';
import { useContext, useEffect, useState, type MouseEvent } from 'react';

import type { Dive } from '../../../lib/core/nodes/dive';
import { NodeContextMenuItem } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeRenameContextMenuItem } from '../../features/nodes/components/NodeRenameContextMenuItem';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { resolveDiveMembership } from '../../shared/diveMembership';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { getDiveRepository } from '../../shared/platform/desktop/diveRepository';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { DiveFlowActionContext } from './diveFlowActionContext';
import { saveWorkspaceDive } from './workspaceDiveMutation';
import { toggleCollapsed } from './WorkspaceVirtualSectionRows';

const rootId = 'workspace-dives';
const rowId = (id: string) => `dive:${id}`;
type DiveSourceSelection = { diveId: string; nodeId: string };
type Context = { id: string; left: number; top: number; source?: DiveSourceSelection };

function DiveFlowMenuItem({ dive, onClose }: { dive: Dive; onClose: () => void }) {
  const t = useTranslation();
  const openFlow = useContext(DiveFlowActionContext);
  const inThisDive = useWorkspaceStore(state => state.reviewSession.dive?.id === dive.id);
  if (!openFlow) return null;
  return (
    <NodeContextMenuItem icon={Play} onSelect={() => {
      onClose();
      const scope = inThisDive ? null : {
        id: dive.id,
        topicIds: resolveDiveMembership(useWorkspaceStore.getState(), dive).topics
      };
      void openFlow(scope);
    }}>
      {t(inThisDive ? 'desktop.nodeList.dive.returnToFlow' : 'desktop.nodeList.dive.startFlow')}
    </NodeContextMenuItem>
  );
}

function RemoveDiveSourceMenuItem({ source, onClose }: { source: DiveSourceSelection; onClose: () => void }) {
  const t = useTranslation();
  return (
    <NodeContextMenuItem icon={ListMinus} onSelect={() => {
      onClose();
      const repository = getDiveRepository();
      if (!repository) return;
      void saveWorkspaceDive(() => repository.remove(source.diveId, source.nodeId)).catch(() => {
        showAppRuntimeNotice(t('desktop.nodeList.addToDive.saveFailed'));
      });
    }}>
      {t('desktop.nodeList.menu.removeFromDive')}
    </NodeContextMenuItem>
  );
}

function DiveContextMenu(props: { context: Context; dive: Dive | undefined; onClose: () => void; onCreate: () => void }) {
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
        {context.source ? (
          <RemoveDiveSourceMenuItem source={context.source} onClose={onClose} />
        ) : (
          <>
            {context.id === rootId ? (
              <NodeContextMenuItem icon={FolderPlus} onSelect={() => { onClose(); props.onCreate(); }}>
                {t('desktop.nodeList.dive.create')}
              </NodeContextMenuItem>
            ) : (
              <>
                {props.dive ? <DiveFlowMenuItem dive={props.dive} onClose={onClose} /> : null}
                <NodeRenameContextMenuItem onSelect={() => { onClose(); requestNodeRename(context.id); }} />
              </>
            )}
          </>
        )}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function useDiveSection(dives: readonly Dive[], selectDive: (id: string) => void) {
  const t = useTranslation();
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
    openMenu: (id: string, event: MouseEvent<HTMLButtonElement>, source?: DiveSourceSelection) => {
      event.preventDefault();
      event.stopPropagation();
      setContext({ id, left: event.clientX, top: event.clientY, ...(source ? { source } : {}) });
    },
    toggle: (id: string) => toggleCollapsed(id, setCollapsed),
    create: () => {
      const repository = getDiveRepository();
      if (!repository) return;
      void saveWorkspaceDive(() => repository.create(untitled)).then((dive) => {
        setCollapsed((current) => new Set([...current].filter((id) => id !== rootId)));
        selectDive(dive.id);
        setPendingRename(dive.id);
      }).catch(failed);
    },
    rename: async (id: string, title: string) => {
      const repository = getDiveRepository();
      if (!repository) return false;
      try {
        await saveWorkspaceDive(() => repository.rename(id.slice('dive:'.length), title.trim() || untitled));
        return true;
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
  activeDiveId: string | null;
  onSelectDive: (id: string) => void;
}) {
  const { dive, section } = props;
  const id = rowId(dive.id);
  const collapsed = section.collapsed.has(id);
  const active = props.activeDiveId === dive.id;
  const sources = dive.directSourceIds.flatMap((id) => props.nodesById[id] ?? []);
  return (
    <>
      <NodeTreeRow depth={1} hasChildren={sources.length > 0} isActive={active} isCollapsed={collapsed}
        isSelected={active} label={dive.title} nodeId={id} rowSpacing={getNodeListRowSpacing()} showIcon={false}
        showLeafChevronPlaceholder={false} onContextMenu={section.openMenu} onRename={section.rename}
        onSelect={() => props.onSelectDive(dive.id)} onToggleCollapse={section.toggle} />
      {!collapsed ? sources.map((source) => (
        <NodeTreeRow key={source.id} depth={2} hasChildren={false} isActive={props.activeNodeId === source.id}
          isCollapsed={false} isSelected={props.activeNodeId === source.id} label={source.title}
          nodeId={`${id}:${source.id}`} showIcon={false} showLeafChevronPlaceholder={false}
          rowSpacing={getNodeListRowSpacing()} onSelect={() => props.onSelectNode(source.id)}
          onContextMenu={(id, event) => section.openMenu(id, event, { diveId: dive.id, nodeId: source.id })}
          onToggleCollapse={() => undefined} />
      )) : null}
    </>
  );
}

export function WorkspaceDiveSection(props: {
  dives: readonly Dive[];
  activeDiveId: string | null;
  onSelectDive: (id: string) => void;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (id: string) => void;
  activeNodeId: string | null;
}) {
  const t = useTranslation();
  const section = useDiveSection(props.dives, props.onSelectDive);
  if (!getDiveRepository()) return null;
  const title = t('desktop.nodeList.dive.tree');
  const collapsed = section.collapsed.has(rootId);
  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <section aria-label={title} className="flex flex-col pt-1" role="tree">
        <NodeTreeRow depth={0} hasChildren isActive={false} isCollapsed={collapsed} isSelected={false}
          label={title} nodeId={rootId} rowSpacing={getNodeListRowSpacing()} showIcon={false}
          onContextMenu={section.openMenu} onSelect={section.toggle} onToggleCollapse={section.toggle} />
        {!collapsed ? section.dives.map((dive) => <DiveRows key={dive.id} {...props} dive={dive} section={section} />) : null}
        {section.context ? (
          <DiveContextMenu context={section.context}
            dive={section.dives.find(dive => rowId(dive.id) === section.context?.id)}
            onClose={section.closeMenu} onCreate={section.create} />
        ) : null}
      </section>
    </div>
  );
}
