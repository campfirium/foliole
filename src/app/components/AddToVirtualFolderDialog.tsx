import { FolderPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import { appendMissingTopicIds, listAvailableManualVirtualFolders } from './workspaceVirtualFolderMembership';

type VirtualFolderTarget = ReturnType<typeof listAvailableManualVirtualFolders>[number];

function useAddToVirtualFolderPalette(props: { onClose: () => void; topicIds: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState('');
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const setFolderManualChildOrder = useWorkspaceStore((state) => state.setFolderManualChildOrder);
  const targets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return listAvailableManualVirtualFolders({ nodeOrder, nodesById, topicIds: props.topicIds })
      .filter((folder) => folder.title.toLocaleLowerCase().includes(normalizedQuery));
  }, [nodeOrder, nodesById, props.topicIds, query]);

  useEffect(() => setActiveIndex(0), [query]);
  const addToFolder = (folderId: string) => {
    const folder = useWorkspaceStore.getState().nodesById[folderId];
    if (!folder || !setFolderManualChildOrder) return;
    setFolderManualChildOrder(folderId, appendMissingTopicIds(folder.manualChildOrder ?? [], props.topicIds));
    props.onClose();
  };
  return { activeIndex, addToFolder, query, setActiveIndex, setQuery, targets };
}

function VirtualFolderResults(props: {
  activeIndex: number;
  onSelect: (folderId: string) => void;
  query: string;
  targets: VirtualFolderTarget[];
}) {
  const t = useTranslation();
  if (!props.targets.length) {
    return (
      <ul aria-label={t('desktop.nodeList.addToVirtualFolder.results')} className={appFloatingListClassName()}>
        <li className={appFloatingEmptyStateClassName()}>
          {props.query.trim()
            ? t('desktop.nodeList.addToVirtualFolder.noResults')
            : t('desktop.nodeList.addToVirtualFolder.empty')}
        </li>
      </ul>
    );
  }
  return (
    <ul aria-label={t('desktop.nodeList.addToVirtualFolder.results')} className={appFloatingListClassName()}>
      {props.targets.map((folder, index) => (
        <li key={folder.id}>
          <button
            className={appFloatingItemClassName('flex items-center gap-3')}
            data-active={index === props.activeIndex}
            onClick={() => props.onSelect(folder.id)}
            type="button"
          >
            <FolderPlus aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{folder.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AddToVirtualFolderDialog(props: { onClose: () => void; topicIds: string[] }) {
  const t = useTranslation();
  const focusTrap = useFloatingDialogFocusTrap(true);
  const palette = useAddToVirtualFolderPalette(props);
  useFloatingPaletteEscape(true, props.onClose);
  const addToActiveFolder = () => {
    const target = palette.targets[palette.activeIndex];
    if (target) palette.addToFolder(target.id);
  };

  return (
    <div
      aria-label={t('desktop.nodeList.addToVirtualFolder.title')}
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={props.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={focusTrap.handleKeyDown}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel={t('desktop.nodeList.addToVirtualFolder.input')}
          onClose={props.onClose}
          onQueryChange={palette.setQuery}
          onRunActive={addToActiveFolder}
          onSetActiveIndex={palette.setActiveIndex}
          placeholder={t('desktop.nodeList.addToVirtualFolder.placeholder')}
          query={palette.query}
          totalItems={palette.targets.length}
        />
        <VirtualFolderResults
          activeIndex={palette.activeIndex}
          onSelect={palette.addToFolder}
          query={palette.query}
          targets={palette.targets}
        />
      </div>
    </div>
  );
}
