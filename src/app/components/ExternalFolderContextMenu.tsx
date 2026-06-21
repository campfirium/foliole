import type { MouseEvent as ReactMouseEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem
} from '../../shared/ui';

export type ExternalFolderContextMenuState =
  | { folderId: string; kind: 'folder'; left: number; top: number }
  | { kind: 'setup'; left: number; top: number };

export function openExternalSetupContextMenu(
  event: ReactMouseEvent<HTMLButtonElement>,
  setContextMenu: (menu: ExternalFolderContextMenuState) => void
) {
  event.preventDefault();
  setContextMenu({ kind: 'setup', left: event.clientX, top: event.clientY });
}

export function openExternalFolderContextMenu(
  event: ReactMouseEvent<HTMLButtonElement>,
  folderId: string,
  setContextMenu: (menu: ExternalFolderContextMenuState) => void
) {
  event.preventDefault();
  setContextMenu({ folderId, kind: 'folder', left: event.clientX, top: event.clientY });
}

export function ExternalFolderContextMenu(props: {
  menu: ExternalFolderContextMenuState | null;
  onChangeFolder?: (folderId: string) => void;
  onClose: () => void;
  onConnectFolder?: () => void;
  onRemoveFolder?: (folderId: string) => void;
  onRescanFolder?: (folderId: string) => void;
}) {
  const t = useTranslation();
  if (!props.menu) return null;
  const folderId = props.menu.kind === 'folder' ? props.menu.folderId : null;
  return (
    <AppSelectionDropdownMenu left={props.menu.left} onClose={props.onClose} top={props.menu.top}>
      {folderId ? (
        <>
          {props.onConnectFolder ? (
            <AppSelectionDropdownMenuItem onClick={() => runMenuAction(props.onConnectFolder, props.onClose)}>
              {t('desktop.externalLibrary.menu.addFolder')}
            </AppSelectionDropdownMenuItem>
          ) : null}
          <AppSelectionDropdownMenuItem onClick={() => runMenuAction(() => props.onChangeFolder?.(folderId), props.onClose)}>
            {t('desktop.externalLibrary.menu.changeFolder')}
          </AppSelectionDropdownMenuItem>
          <AppSelectionDropdownMenuItem onClick={() => runMenuAction(() => props.onRescanFolder?.(folderId), props.onClose)}>
            {t('desktop.externalLibrary.menu.rescan')}
          </AppSelectionDropdownMenuItem>
          <AppSelectionDropdownMenuItem onClick={() => runMenuAction(() => props.onRemoveFolder?.(folderId), props.onClose)}>
            {t('desktop.externalLibrary.menu.removeFolder')}
          </AppSelectionDropdownMenuItem>
        </>
      ) : (
        <AppSelectionDropdownMenuItem onClick={() => runMenuAction(props.onConnectFolder, props.onClose)}>
          {t('desktop.externalLibrary.menu.connectFolder')}
        </AppSelectionDropdownMenuItem>
      )}
    </AppSelectionDropdownMenu>
  );
}

function runMenuAction(action: (() => void) | undefined, onClose: () => void) {
  onClose();
  action?.();
}
