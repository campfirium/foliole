import { Pencil } from 'lucide-react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { NodeContextMenuItem } from './nodeListContextMenuPresentation';

export function NodeRenameContextMenuItem(props: { onSelect: () => void }) {
  const t = useTranslation();
  return (
    <NodeContextMenuItem icon={Pencil} onSelect={props.onSelect}>
      {t('desktop.nodeList.menu.rename')}
    </NodeContextMenuItem>
  );
}
