import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import { onWindowEscape } from '../../../shared/platform/keyboard';
import { appFloatingSurfaceClassName } from '../../../shared/ui/FloatingSurface';

interface RemoteImageFailureContextMenuOptions {
  anchor: HTMLElement;
  canForgetLearnedSource?: boolean;
  left: number;
  onForgetLearnedSource: () => void;
  onProvideSourceWebsite: () => void;
  onRemoveImage?: (() => void) | null;
  onRetry: () => void;
  top: number;
}

let closeActiveMenu: (() => void) | null = null;

function createMenuItem(label: string, onSelect: () => void) {
  const item = document.createElement('button');
  item.className = [
    'relative flex min-h-9 w-full cursor-default select-none items-center px-3 text-left text-sm font-semibold outline-none transition-colors',
    'hover:bg-[var(--app-selection-surface-color)] focus:bg-[var(--app-selection-surface-color)]'
  ].join(' ');
  item.role = 'menuitem';
  item.textContent = label;
  item.type = 'button';
  item.addEventListener('pointerdown', (event) => event.preventDefault());
  item.addEventListener('click', () => {
    closeActiveRemoteImageFailureMenu();
    onSelect();
  });
  return item;
}

function clampMenuPosition(left: number, top: number) {
  const menuWidth = 208;
  const menuHeight = 120;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8))
  };
}

export function closeActiveRemoteImageFailureMenu() {
  closeActiveMenu?.();
  closeActiveMenu = null;
}

export function openRemoteImageFailureContextMenu(options: RemoteImageFailureContextMenuOptions) {
  const locale = getStoredAppLocale();
  closeActiveRemoteImageFailureMenu();
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-workspace-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.addEventListener('pointerdown', closeActiveRemoteImageFailureMenu);
  overlay.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const menu = document.createElement('div');
  const position = clampMenuPosition(options.left, options.top);
  menu.className = appFloatingSurfaceClassName('popover', 'fixed z-floating min-w-[188px] overflow-hidden p-1 text-foreground');
  menu.role = 'menu';
  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const items = [
    createMenuItem(translate(locale, 'desktop.editor.imageFailure.retry'), options.onRetry),
    createMenuItem(translate(locale, 'desktop.editor.imageFailure.addSource'), options.onProvideSourceWebsite)
  ];
  if (options.onRemoveImage) {
    items.push(createMenuItem(translate(locale, 'desktop.editor.imageFailure.remove'), options.onRemoveImage));
  }
  if (options.canForgetLearnedSource) {
    items.push(createMenuItem(translate(locale, 'desktop.editor.imageFailure.forgetLearnedSource'), options.onForgetLearnedSource));
  }
  menu.append(...items);

  const disconnectObserver = new MutationObserver(() => {
    if (!options.anchor.isConnected) closeActiveRemoteImageFailureMenu();
  });
  const unlistenEscape = onWindowEscape(closeActiveRemoteImageFailureMenu);
  closeActiveMenu = () => {
    overlay.remove();
    menu.remove();
    unlistenEscape();
    disconnectObserver.disconnect();
  };
  document.body.append(overlay, menu);
  disconnectObserver.observe(document.body, { childList: true, subtree: true });
  menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}
