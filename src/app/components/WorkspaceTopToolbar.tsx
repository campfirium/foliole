import { CalendarClock, FileText, Highlighter, Link2, PanelLeft, TableOfContents, Trash2, Waypoints } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

export type WorkspaceRightPanelId = 'review-queue' | 'outline' | 'highlights' | 'backlinks' | 'performance' | 'dev';

const toolbarButtonClassName = 'size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground';
const activeToolbarButtonClassName = `${toolbarButtonClassName} data-[active=true]:bg-foreground/[0.06] data-[active=true]:text-foreground`;

interface WorkspaceTopToolbarProps {
  isTrashViewOpen: boolean;
  activeRightPanelId: WorkspaceRightPanelId;
  isRightSidebarCollapsed: boolean;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleListVisibility: () => void;
}

function InspectorActionButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: JSX.Element;
  label: string;
  onClick: () => void;
}) {
  return (
    <AppIconButton
      aria-pressed={active}
      className={activeToolbarButtonClassName}
      data-active={active}
      icon={icon}
      label={label}
      onClick={onClick}
    />
  );
}

function renderInspectorActions(
  activeRightPanelId: WorkspaceRightPanelId,
  isRightSidebarCollapsed: boolean,
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void,
  t: ReturnType<typeof useTranslation>
) {
  return (
    <>
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'review-queue'}
        icon={<Waypoints aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.toolbar.panel.flow')}
        onClick={() => onSelectRightPanel('review-queue')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'outline'}
        icon={<TableOfContents aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.toolbar.panel.outline')}
        onClick={() => onSelectRightPanel('outline')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'highlights'}
        icon={<Highlighter aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.toolbar.panel.highlights')}
        onClick={() => onSelectRightPanel('highlights')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'backlinks'}
        icon={<Link2 aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.toolbar.panel.backlinks')}
        onClick={() => onSelectRightPanel('backlinks')}
      />
      <InspectorActionButton
        active={!isRightSidebarCollapsed && activeRightPanelId === 'dev'}
        icon={<CalendarClock aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.toolbar.panel.scheduling')}
        onClick={() => onSelectRightPanel('dev')}
      />
    </>
  );
}

export function WorkspaceTopToolbar({
  activeRightPanelId,
  isTrashViewOpen,
  isRightSidebarCollapsed,
  onOpenNotesView,
  onOpenTrashView,
  onSelectRightPanel,
  onToggleListVisibility
}: WorkspaceTopToolbarProps) {
  const t = useTranslation();
  return (
    <AppToolbar aria-label={t('desktop.toolbar.workspace')} className="workspace-toolbar-surface min-h-[40px] border-b border-divider bg-bg-subtle px-3">
      <ToolbarActionGroup ariaLabel={t('desktop.toolbar.primaryNavigation')}>
        <AppIconButton
          className={toolbarButtonClassName}
          icon={<PanelLeft aria-hidden="true" size={16} strokeWidth={1.75} />}
          label={t('desktop.toolbar.toggleTopicList')}
          onClick={onToggleListVisibility}
        />
        <AppIconButton
          className={activeToolbarButtonClassName}
          data-active={!isTrashViewOpen}
          icon={<FileText aria-hidden="true" size={16} strokeWidth={1.75} />}
          label={t('desktop.toolbar.openTopicsView')}
          onClick={onOpenNotesView}
        />
        <AppIconButton
          className={activeToolbarButtonClassName}
          data-active={isTrashViewOpen}
          icon={<Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />}
          label={t('desktop.toolbar.openTrashView')}
          onClick={onOpenTrashView}
        />
      </ToolbarActionGroup>
      <div className="flex-1" />
      <ToolbarActionGroup ariaLabel={t('desktop.toolbar.inspector')}>
        {renderInspectorActions(activeRightPanelId, isRightSidebarCollapsed, onSelectRightPanel, t)}
      </ToolbarActionGroup>
    </AppToolbar>
  );
}
