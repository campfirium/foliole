import { HardDrive } from 'lucide-react';
import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react';

import { usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { useRuntimeAvailability } from '../../shared/platform/runtimeAvailability';
import { usesNativeMacOSWindowControls } from '../../shared/platform/windowChrome';
import {
  closeMainWindow,
  isWindowControlsAvailable,
  minimizeMainWindow,
  onMainWindowResized,
  queryMainWindowMaximized,
  toggleMainWindowMaximize
} from '../../shared/platform/windowControls';

import { WindowControlButtons } from './WindowControlButtons';
import { WindowSidebarToggleButton } from './WindowSidebarToggleButton';
import {
  WINDOW_TITLEBAR_CONTROLS_WIDTH,
  WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH,
  WINDOW_TITLEBAR_RIGHT_ZONE_CONTROL_GAP
} from './windowTitleBarLayout';
import { WindowTitleBarRightSidebarAnchor } from './WindowTitleBarRightSidebarAnchor';
import { PdfWindowTitle } from './WorkspacePdfTopBars';
import { WorkspaceSurfaceRowOverlay, WorkspaceTitlebarDividers } from './WorkspaceSurfaceRowOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

interface WindowTitleBarProps {
  activeRightPanelId: WorkspaceRightPanelId;
  centerTitle: string | null;
  centerTitleIcon?: 'external';
  isListCollapsed: boolean;
  isListFloating?: boolean | undefined;
  keepFloatingSidebarControls?: boolean | undefined;
  dockedListCollapsed?: boolean | undefined;
  dockedRightCollapsed?: boolean | undefined;
  isRightSidebarCollapsed: boolean;
  isRightSidebarFloating?: boolean | undefined;
  isTrashViewOpen: boolean;
  listWidth: number;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleRightSidebarVisibility: () => void;
  onOpenTrashView: () => void;
  onToggleListVisibility: () => void;
  rightSidebarWidth: number;
}

function runWindowAction(action: () => Promise<void>) {
  void action().catch((error) => {
    console.error('[window-titlebar] window action failed', error);
  });
}

function useWindowControlState() {
  const controlsEnabled = useRuntimeAvailability(isWindowControlsAvailable);
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximizedState = useCallback(async () => {
    if (!controlsEnabled) {
      setIsMaximized(false);
      return;
    }
    setIsMaximized(await queryMainWindowMaximized());
  }, [controlsEnabled]);

  useEffect(() => {
    if (!controlsEnabled) {
      setIsMaximized(false);
      return;
    }

    void syncMaximizedState();
    let unlisten: (() => void) | undefined;
    void onMainWindowResized(() => {
      void syncMaximizedState();
    })
      .then((dispose) => {
        unlisten = dispose ?? undefined;
      })
      .catch((error) => {
        console.error('[window-titlebar] failed to subscribe resize listener', error);
      });
    return () => {
      unlisten?.();
    };
  }, [controlsEnabled, syncMaximizedState]);

  return {
    controlsEnabled,
    isMaximized,
    syncMaximizedState
  };
}

function WindowLeadingActions({
  isListCollapsed,
  isListFloating,
  keepFloatingSidebarControls,
  dockedListCollapsed,
  onToggleListVisibility
}: WindowTitleBarProps) {
  const t = useTranslation();
  const collapsed = keepFloatingSidebarControls && isListFloating ? dockedListCollapsed : isListCollapsed;
  return (
    <div className="window-titlebar-left-zone relative z-local-control" data-collapsed={Boolean(collapsed)}>
      <div className={collapsed ? 'window-titlebar-collapsed-left-action' : 'window-titlebar-leading'}>
        <div className="window-titlebar-leading-primary">
          <WindowSidebarToggleButton active={!collapsed} label={t('desktop.workspace.toggleLeftPanel')} onClick={onToggleListVisibility} side="left" />
        </div>
      </div>
    </div>
  );
}

function WindowCenterTitle({ icon, onDoubleClick, title }: { icon?: 'external'; onDoubleClick: () => void; title: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="window-titlebar-center-slot window-titlebar-drag-fill relative z-local-control col-start-2 row-start-1"
      onDoubleClick={onDoubleClick}
    >
      {title ? (
        <span className="window-titlebar-center-title gap-1.5" title={title}>
          <span className="min-w-0 truncate" title={title}>{title}</span>
          {icon === 'external' ? <HardDrive aria-hidden="true" className="flex-none" size={14} strokeWidth={1.7} /> : null}
        </span>
      ) : null}
    </div>
  );
}

function getWindowTitleBarStyle(
  props: WindowTitleBarProps,
  controlsWidth: number
): CSSProperties {
  const leftUndocked = props.isListCollapsed || props.isListFloating;
  const rightUndocked = (props.isRightSidebarCollapsed || props.isRightSidebarFloating) &&
    !(props.keepFloatingSidebarControls && props.isRightSidebarFloating);
  const keepLeftWidth = props.keepFloatingSidebarControls && props.isListFloating;
  const leftRevealed = keepLeftWidth && !props.isListCollapsed;
  const rightRevealed = props.keepFloatingSidebarControls && props.isRightSidebarFloating && !props.isRightSidebarCollapsed;
  return {
    '--workspace-titlebar-sidebar-current-width': rightRevealed ? `${props.rightSidebarWidth}px` : undefined,
    '--window-titlebar-left-width': `calc(var(--workspace-rail-width) + ${
      leftUndocked && !keepLeftWidth ? 0 : props.listWidth + 1
    }px)`,
    '--window-titlebar-controls-width': `${controlsWidth}px`,
    '--window-titlebar-controls-gap': `${controlsWidth > 0 ? WINDOW_TITLEBAR_RIGHT_ZONE_CONTROL_GAP : 0}px`,
    '--window-titlebar-right-width': rightUndocked
      ? `${controlsWidth + WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH + 8}px`
      : `${props.rightSidebarWidth}px`,
    '--workspace-list-width': `${props.listWidth}px`,
    '--workspace-titlebar-folder-column-width': leftUndocked && !leftRevealed ? '0px' : 'min(var(--workspace-folder-column-width), var(--workspace-list-width))',
    '--workspace-titlebar-list-current-width': leftRevealed ? `${props.listWidth}px` : leftUndocked ? '0px' : 'var(--workspace-list-current-width, 300px)'
  } as CSSProperties;
}

function renderRightSidebarAnchor(props: WindowTitleBarProps, controlsWidth: number) {
  return (
    <WindowTitleBarRightSidebarAnchor
      activeRightPanelId={props.activeRightPanelId}
      controlsWidth={controlsWidth}
      isRightSidebarCollapsed={props.isRightSidebarCollapsed}
      isRightSidebarFloating={props.isRightSidebarFloating}
      keepFloatingSidebarControls={props.keepFloatingSidebarControls}
      dockedRightCollapsed={props.dockedRightCollapsed}
      onSelectRightPanel={props.onSelectRightPanel}
      onToggleRightSidebarVisibility={props.onToggleRightSidebarVisibility}
      rightSidebarWidth={props.rightSidebarWidth}
    />
  );
}

function useWindowControlActions(controlsEnabled: boolean, syncMaximizedState: () => Promise<void>) {
  const handleMinimize = useCallback(() => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(minimizeMainWindow);
  }, [controlsEnabled]);

  const handleToggleMaximize = useCallback(() => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(async () => {
      await toggleMainWindowMaximize();
      await syncMaximizedState();
    });
  }, [controlsEnabled, syncMaximizedState]);

  const handleClose = useCallback(() => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(closeMainWindow);
  }, [controlsEnabled]);

  return { handleMinimize, handleToggleMaximize, handleClose };
}

export const WindowTitleBar = memo(function WindowTitleBar(props: WindowTitleBarProps) {
  const { floating, visible, setActivity } = usePdfTopBars();
  useEffect(() => () => setActivity('workspace-titlebar', false), [floating, setActivity]);
  const { controlsEnabled, isMaximized, syncMaximizedState } = useWindowControlState();
  const { isDemo } = useDemoRuntimeState();
  const nativeMacOSControls = !isDemo && usesNativeMacOSWindowControls();
  const controlsWidth = isDemo || nativeMacOSControls ? 0 : WINDOW_TITLEBAR_CONTROLS_WIDTH;

  const { handleMinimize, handleToggleMaximize, handleClose } = useWindowControlActions(controlsEnabled, syncMaximizedState);

  return (
    <header
      className="window-titlebar"
      data-window-controls={isDemo ? 'none' : nativeMacOSControls ? 'native-macos' : 'custom'}
      data-window-maximized={isMaximized}
      onMouseEnter={() => {
        if (floating && visible) setActivity('workspace-titlebar', true);
      }}
      onMouseLeave={() => setActivity('workspace-titlebar', false)}
      style={getWindowTitleBarStyle(props, controlsWidth)}
    >
      <WorkspaceSurfaceRowOverlay row="titlebar" />
      <WorkspaceTitlebarDividers
        isListCollapsed={props.isListCollapsed || Boolean(props.isListFloating && !props.keepFloatingSidebarControls)}
        isRightSidebarCollapsed={props.isRightSidebarCollapsed || Boolean(props.isRightSidebarFloating && !props.keepFloatingSidebarControls)}
      />
      <WindowLeadingActions {...props} />
      <PdfWindowTitle><WindowCenterTitle
        onDoubleClick={handleToggleMaximize}
        title={props.centerTitle}
        {...definedProps({ icon: props.centerTitleIcon })}
      />
      </PdfWindowTitle>
      {renderRightSidebarAnchor(props, controlsWidth)}
      {isDemo || nativeMacOSControls ? null : (
        <WindowControlButtons
          controlsEnabled={controlsEnabled}
          isMaximized={isMaximized}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onToggleMaximize={handleToggleMaximize}
        />
      )}
    </header>
  );
});
